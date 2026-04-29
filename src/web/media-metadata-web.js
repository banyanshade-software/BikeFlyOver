// F-web: Browser-native media metadata extraction.
// Replaces src/shared/media-metadata.js for the web build.
// - Images: exifr (same library used by the Electron side, runs in browsers)
// - Videos: mediainfo.js (WebAssembly port of MediaInfoLib)

import exifr from "exifr";
import MediaInfoFactory from "mediainfo.js";

// ── shared helpers (mirrored from src/shared/media-metadata.js) ─────────────

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildCameraIdentity({ make, model, serialNumber, source }) {
  const nm = normalizeOptionalString(make);
  const nmo = normalizeOptionalString(model);
  const ns = normalizeOptionalString(serialNumber);

  if (!nm && !nmo && !ns) {
    return {
      cameraIdentityId: null,
      cameraIdentityLabel: null,
      cameraIdentitySource: null,
    };
  }

  return {
    cameraIdentityId: [nm?.toLowerCase(), nmo?.toLowerCase(), ns?.toLowerCase()]
      .filter(Boolean)
      .join("|"),
    cameraIdentityLabel: [nm, nmo, ns ? `#${ns}` : null].filter(Boolean).join(" "),
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
} = {}) {
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

// ── image extraction ─────────────────────────────────────────────────────────

async function extractImageMetadata(file) {
  try {
    const metadata = await exifr.parse(file, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
      "Make",
      "Model",
      "BodySerialNumber",
      "SerialNumber",
    ]);

    const candidates = [
      { value: metadata?.DateTimeOriginal, source: "exif:DateTimeOriginal" },
      { value: metadata?.CreateDate, source: "exif:CreateDate" },
      { value: metadata?.ModifyDate, source: "exif:ModifyDate", confidence: "fallback" },
    ];
    const selected = candidates.find((c) => c.value) ?? null;

    const cameraIdentity = buildCameraIdentity({
      make: metadata?.Make,
      model: metadata?.Model,
      serialNumber: metadata?.BodySerialNumber ?? metadata?.SerialNumber,
      source: "exif:Make/Model",
    });

    if (!selected) {
      return normalizeTimestampResult(cameraIdentity);
    }

    return normalizeTimestampResult({ ...selected, ...cameraIdentity });
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

// ── video extraction ─────────────────────────────────────────────────────────

// MediaInfo date strings use "UTC 2023-04-15 12:00:00" or ISO-8601 formats.
function parseMediaInfoDate(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/^UTC\s+/, "").trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function extractVideoMetadata(file) {
  let mi;
  try {
    mi = await MediaInfoFactory({ format: "object", locateFile: (f) => `/mediainfo/${f}` });
    const result = await mi.analyzeData(
      () => file.size,
      async (chunkSize, offset) => {
        const slice = file.slice(offset, offset + chunkSize);
        return new Uint8Array(await slice.arrayBuffer());
      },
    );

    // Extract from the General track
    const general = result?.media?.track?.find((t) => t["@type"] === "General") ?? {};

    const rawDuration = general.Duration;
    const mediaDurationMs =
      typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? Math.round(rawDuration * 1000)
        : null;

    // Date candidates: prefer Encoded_Date, then Tagged_Date
    const dateCandidates = [
      { raw: general.Encoded_Date, source: "mediainfo:Encoded_Date" },
      { raw: general.Tagged_Date, source: "mediainfo:Tagged_Date", confidence: "fallback" },
    ];
    const selected = dateCandidates
      .map((c) => ({ ...c, value: parseMediaInfoDate(c.raw) }))
      .find((c) => c.value) ?? null;

    // Camera make/model are not reliably available via mediainfo.js from QuickTime atoms.
    const cameraIdentity = buildCameraIdentity({});

    if (!selected) {
      return normalizeTimestampResult({ mediaDurationMs, ...cameraIdentity });
    }

    return normalizeTimestampResult({
      value: selected.value,
      source: selected.source,
      confidence: selected.confidence ?? "metadata",
      originalValue: selected.raw,
      mediaDurationMs,
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
  } finally {
    mi?.close();
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export async function extractWebMediaMetadata(file, mediaType) {
  if (mediaType === "image") return extractImageMetadata(file);
  if (mediaType === "video") return extractVideoMetadata(file);
  return normalizeTimestampResult({});
}
// end F-web
