const path = require("node:path");
const { spawn } = require("node:child_process");
const exifr = require("exifr");
const ffprobeStatic = require("ffprobe-static");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

function detectMediaType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return null;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildCameraIdentity({ make, model, serialNumber, source }) {
  const normalizedMake = normalizeOptionalString(make);
  const normalizedModel = normalizeOptionalString(model);
  const normalizedSerialNumber = normalizeOptionalString(serialNumber);

  if (!normalizedMake && !normalizedModel && !normalizedSerialNumber) {
    return {
      cameraIdentityId: null,
      cameraIdentityLabel: null,
      cameraIdentitySource: null,
    };
  }

  return {
    cameraIdentityId: [
      normalizedMake?.toLowerCase(),
      normalizedModel?.toLowerCase(),
      normalizedSerialNumber?.toLowerCase(),
    ]
      .filter(Boolean)
      .join("|"),
    cameraIdentityLabel: [
      normalizedMake,
      normalizedModel,
      normalizedSerialNumber ? `#${normalizedSerialNumber}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    cameraIdentitySource: source || null,
  };
}

function normalizeTimestampResult({
  value,
  source,
  confidence = "metadata",
  originalValue,
  mediaDurationMs = null,
  cameraIdentityId = null,
  cameraIdentityLabel = null,
  cameraIdentitySource = null,
}) {
  if (!value) {
    return {
      mediaDurationMs,
      timestampMetadataStatus: "missing",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "missing",
      timestampMetadataError: null,
      cameraIdentityId,
      cameraIdentityLabel,
      cameraIdentitySource,
    };
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      mediaDurationMs,
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: source || null,
      timestampOriginalValue: originalValue ?? String(value),
      timestampConfidence: "invalid",
      timestampMetadataError: "Timestamp metadata could not be parsed.",
      cameraIdentityId,
      cameraIdentityLabel,
      cameraIdentitySource,
    };
  }

  return {
    mediaDurationMs,
    timestampMetadataStatus: "extracted",
    capturedAt: parsedDate.toISOString(),
    capturedAtTimestamp: parsedDate.getTime(),
    timestampSource: source,
    timestampOriginalValue: originalValue ?? parsedDate.toISOString(),
    timestampConfidence: confidence,
    timestampMetadataError: null,
    cameraIdentityId,
    cameraIdentityLabel,
    cameraIdentitySource,
  };
}

function normalizeDurationMs(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 1000);
}

function selectImageTimestampCandidate(metadata = {}) {
  const candidates = [
    {
      value: metadata.DateTimeOriginal,
      source: "exif:DateTimeOriginal",
    },
    {
      value: metadata.CreateDate,
      source: "exif:CreateDate",
    },
    {
      value: metadata.ModifyDate,
      source: "exif:ModifyDate",
      confidence: "fallback",
    },
  ];

  return candidates.find((candidate) => candidate.value) || null;
}

function extractImageCameraIdentity(metadata = {}) {
  return buildCameraIdentity({
    make: metadata.Make,
    model: metadata.Model,
    serialNumber: metadata.BodySerialNumber ?? metadata.SerialNumber,
    source: "exif:Make/Model",
  });
}

async function extractImageTimestampMetadata(filePath) {
  try {
    const metadata = await exifr.parse(filePath, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
      "Make",
      "Model",
      "BodySerialNumber",
      "SerialNumber",
    ]);
    const selectedCandidate = selectImageTimestampCandidate(metadata);
    const cameraIdentity = extractImageCameraIdentity(metadata);

    if (!selectedCandidate) {
      return normalizeTimestampResult(cameraIdentity);
    }

    return normalizeTimestampResult({
      ...selectedCandidate,
      ...cameraIdentity,
    });
  } catch (error) {
    return {
      mediaDurationMs: null,
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "error",
      timestampMetadataError:
        error instanceof Error ? error.message : String(error),
      cameraIdentityId: null,
      cameraIdentityLabel: null,
      cameraIdentitySource: null,
    };
  }
}

function runFfprobe(filePath) {
  return new Promise((resolve, reject) => {
    if (!ffprobeStatic?.path) {
      reject(new Error("ffprobe binary is unavailable."));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    const ffprobe = spawn(
      ffprobeStatic.path,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_entries",
        "format=duration:format_tags=creation_time,com.apple.quicktime.creationdate,make,model,com.apple.quicktime.make,com.apple.quicktime.model:stream_tags=creation_time,com.apple.quicktime.creationdate,make,model,com.apple.quicktime.make,com.apple.quicktime.model",
        filePath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    ffprobe.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
    });

    ffprobe.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    ffprobe.on("error", (error) => {
      reject(error);
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            Buffer.concat(stderrChunks).toString("utf8").trim() ||
              `ffprobe exited with status ${code}.`,
          ),
        );
        return;
      }

      try {
        const parsed = JSON.parse(
          Buffer.concat(stdoutChunks).toString("utf8") || "{}",
        );
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getTagMaps(ffprobeOutput = {}) {
  const formatTags = ffprobeOutput?.format?.tags || {};
  const streamTags = Array.isArray(ffprobeOutput?.streams)
    ? ffprobeOutput.streams.flatMap((stream) => {
        return stream?.tags ? [stream.tags] : [];
      })
    : [];

  return {
    formatTags,
    streamTags,
  };
}

function selectVideoTimestampCandidate(ffprobeOutput = {}) {
  const { formatTags, streamTags } = getTagMaps(ffprobeOutput);
  const candidates = [
    {
      value: formatTags["com.apple.quicktime.creationdate"],
      source: "ffprobe:format.com.apple.quicktime.creationdate",
    },
    {
      value: formatTags.creation_time,
      source: "ffprobe:format.creation_time",
      confidence: "fallback",
    },
    ...streamTags.flatMap((tags, index) => {
      return [
        {
          value: tags["com.apple.quicktime.creationdate"],
          source: `ffprobe:stream[${index}].com.apple.quicktime.creationdate`,
        },
        {
          value: tags.creation_time,
          source: `ffprobe:stream[${index}].creation_time`,
          confidence: "fallback",
        },
      ];
    }),
  ];

  return candidates.find((candidate) => candidate.value) || null;
}

function extractVideoCameraIdentity(ffprobeOutput = {}) {
  const { formatTags, streamTags } = getTagMaps(ffprobeOutput);
  const candidates = [
    {
      make: formatTags["com.apple.quicktime.make"] ?? formatTags.make,
      model: formatTags["com.apple.quicktime.model"] ?? formatTags.model,
      source:
        formatTags["com.apple.quicktime.make"] || formatTags["com.apple.quicktime.model"]
          ? "ffprobe:format.quicktime.make-model"
          : "ffprobe:format.make-model",
    },
    ...streamTags.map((tags, index) => {
      return {
        make: tags["com.apple.quicktime.make"] ?? tags.make,
        model: tags["com.apple.quicktime.model"] ?? tags.model,
        source:
          tags["com.apple.quicktime.make"] || tags["com.apple.quicktime.model"]
            ? `ffprobe:stream[${index}].quicktime.make-model`
            : `ffprobe:stream[${index}].make-model`,
      };
    }),
  ];

  for (const candidate of candidates) {
    const identity = buildCameraIdentity(candidate);

    if (identity.cameraIdentityId) {
      return identity;
    }
  }

  return buildCameraIdentity({});
}

async function extractVideoTimestampMetadata(filePath) {
  try {
    const ffprobeOutput = await runFfprobe(filePath);
    const mediaDurationMs = normalizeDurationMs(ffprobeOutput?.format?.duration);
    const selectedCandidate = selectVideoTimestampCandidate(ffprobeOutput);
    const cameraIdentity = extractVideoCameraIdentity(ffprobeOutput);

    if (!selectedCandidate) {
      return normalizeTimestampResult({
        mediaDurationMs,
        ...cameraIdentity,
      });
    }

    return normalizeTimestampResult({
      ...selectedCandidate,
      mediaDurationMs,
      originalValue: selectedCandidate.value,
      ...cameraIdentity,
    });
  } catch (error) {
    return {
      mediaDurationMs: null,
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "error",
      timestampMetadataError:
        error instanceof Error ? error.message : String(error),
      cameraIdentityId: null,
      cameraIdentityLabel: null,
      cameraIdentitySource: null,
    };
  }
}

async function extractMediaTimestampMetadata(filePath, mediaType) {
  if (mediaType === "image") {
    return extractImageTimestampMetadata(filePath);
  }

  if (mediaType === "video") {
    return extractVideoTimestampMetadata(filePath);
  }

  return normalizeTimestampResult({});
}

module.exports = {
  buildCameraIdentity,
  detectMediaType,
  extractImageCameraIdentity,
  extractMediaTimestampMetadata,
  extractVideoCameraIdentity,
  normalizeTimestampResult,
  selectImageTimestampCandidate,
  selectVideoTimestampCandidate,
};
