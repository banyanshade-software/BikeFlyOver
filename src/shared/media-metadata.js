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

function normalizeTimestampResult({
  value,
  source,
  confidence = "metadata",
  originalValue,
}) {
  if (!value) {
    return {
      timestampMetadataStatus: "missing",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "missing",
      timestampMetadataError: null,
    };
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: source || null,
      timestampOriginalValue: originalValue ?? String(value),
      timestampConfidence: "invalid",
      timestampMetadataError: "Timestamp metadata could not be parsed.",
    };
  }

  return {
    timestampMetadataStatus: "extracted",
    capturedAt: parsedDate.toISOString(),
    capturedAtTimestamp: parsedDate.getTime(),
    timestampSource: source,
    timestampOriginalValue: originalValue ?? parsedDate.toISOString(),
    timestampConfidence: confidence,
    timestampMetadataError: null,
  };
}

async function extractImageTimestampMetadata(filePath) {
  try {
    const metadata = await exifr.parse(filePath, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
    ]);
    const candidates = [
      {
        value: metadata?.DateTimeOriginal,
        source: "exif:DateTimeOriginal",
      },
      {
        value: metadata?.CreateDate,
        source: "exif:CreateDate",
      },
      {
        value: metadata?.ModifyDate,
        source: "exif:ModifyDate",
        confidence: "fallback",
      },
    ];
    const selectedCandidate = candidates.find((candidate) => candidate.value);

    if (!selectedCandidate) {
      return normalizeTimestampResult({});
    }

    return normalizeTimestampResult(selectedCandidate);
  } catch (error) {
    return {
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "error",
      timestampMetadataError:
        error instanceof Error ? error.message : String(error),
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
        "format_tags=creation_time,com.apple.quicktime.creationdate:stream_tags=creation_time,com.apple.quicktime.creationdate",
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

async function extractVideoTimestampMetadata(filePath) {
  try {
    const ffprobeOutput = await runFfprobe(filePath);
    const formatTags = ffprobeOutput?.format?.tags || {};
    const streamTags = Array.isArray(ffprobeOutput?.streams)
      ? ffprobeOutput.streams.flatMap((stream) => {
          return stream?.tags ? [stream.tags] : [];
        })
      : [];
    const candidates = [
      {
        value: formatTags.creation_time,
        source: "ffprobe:format.creation_time",
      },
      {
        value: formatTags["com.apple.quicktime.creationdate"],
        source: "ffprobe:format.com.apple.quicktime.creationdate",
      },
      ...streamTags.flatMap((tags, index) => {
        return [
          {
            value: tags.creation_time,
            source: `ffprobe:stream[${index}].creation_time`,
          },
          {
            value: tags["com.apple.quicktime.creationdate"],
            source: `ffprobe:stream[${index}].com.apple.quicktime.creationdate`,
          },
        ];
      }),
    ];
    const selectedCandidate = candidates.find((candidate) => candidate.value);

    if (!selectedCandidate) {
      return normalizeTimestampResult({});
    }

    return normalizeTimestampResult({
      ...selectedCandidate,
      originalValue: selectedCandidate.value,
    });
  } catch (error) {
    return {
      timestampMetadataStatus: "error",
      capturedAt: null,
      capturedAtTimestamp: null,
      timestampSource: null,
      timestampOriginalValue: null,
      timestampConfidence: "error",
      timestampMetadataError:
        error instanceof Error ? error.message : String(error),
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
  detectMediaType,
  extractMediaTimestampMetadata,
};
