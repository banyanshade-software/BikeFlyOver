const path = require("node:path");
const { EXPORT_DEFAULTS, normalizeExportSettings } = require("./export");

const PROJECT_STATE_SCHEMA_VERSION = 1;

function normalizeFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOptionalFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeTrackReference(rawTrack = {}) {
  const filePath = normalizeOptionalString(rawTrack?.filePath);

  if (!filePath) {
    return null;
  }

  return {
    fileName: normalizeOptionalString(rawTrack?.fileName) || path.basename(filePath),
    filePath,
    importFormat: normalizeOptionalString(rawTrack?.importFormat),
  };
}

function normalizeMediaType(mediaType) {
  return mediaType === "video" ? "video" : "image";
}

// F-54: define one serializable project-state shape now so future save/load work can reuse a tested persistence contract.
function normalizePersistedMediaItem(rawItem = {}) {
  return {
    alignedActivityTimestamp: normalizeOptionalFiniteNumber(
      rawItem.alignedActivityTimestamp,
    ),
    alignmentStatus:
      normalizeOptionalString(rawItem.alignmentStatus) || "missing-timestamp",
    capturedAt: normalizeOptionalString(rawItem.capturedAt),
    capturedAtTimestamp: normalizeOptionalFiniteNumber(rawItem.capturedAtTimestamp),
    fileName:
      normalizeOptionalString(rawItem.fileName) ||
      path.basename(normalizeOptionalString(rawItem.filePath) || ""),
    filePath: normalizeOptionalString(rawItem.filePath),
    id: normalizeOptionalString(rawItem.id),
    mediaDurationMs: normalizeOptionalFiniteNumber(rawItem.mediaDurationMs),
    mediaType: normalizeMediaType(rawItem.mediaType),
    nearestTrackIndex: Number.isInteger(rawItem.nearestTrackIndex)
      ? rawItem.nearestTrackIndex
      : null,
    timestampConfidence:
      normalizeOptionalString(rawItem.timestampConfidence) || "missing",
    timestampMetadataError: normalizeOptionalString(rawItem.timestampMetadataError),
    timestampMetadataStatus:
      normalizeOptionalString(rawItem.timestampMetadataStatus) || "missing",
    timestampOriginalValue: normalizeOptionalString(rawItem.timestampOriginalValue),
    timestampSource: normalizeOptionalString(rawItem.timestampSource),
  };
}

function normalizePlaybackSnapshot(rawPlayback = {}) {
  const normalizedExportSubset = normalizeExportSettings({
    adaptiveStrength: rawPlayback.adaptiveStrength,
    cameraMode: rawPlayback.cameraMode,
    cameraSettings: rawPlayback.cameraSettings,
    overlayVisibility: rawPlayback.overlayVisibility,
    speedGaugeMaxKph: rawPlayback.speedGaugeMaxKph,
    speedMultiplier: rawPlayback.speedMultiplier,
    terrainSettings: rawPlayback.terrainSettings,
  });
  const currentTimestamp = normalizeFiniteNumber(rawPlayback.currentTimestamp, 0);

  return {
    adaptiveStrength: normalizedExportSubset.adaptiveStrength,
    cameraMode: normalizedExportSubset.cameraMode,
    cameraSettings: normalizedExportSubset.cameraSettings,
    currentTimestamp,
    isPlaying: Boolean(rawPlayback.isPlaying),
    overlayVisibility: normalizedExportSubset.overlayVisibility,
    speedGaugeMaxKph: normalizedExportSubset.speedGaugeMaxKph,
    speedGaugePeakKph: Math.max(
      0,
      normalizeFiniteNumber(rawPlayback.speedGaugePeakKph, 0),
    ),
    speedGaugePeakTimestamp: normalizeFiniteNumber(
      rawPlayback.speedGaugePeakTimestamp,
      currentTimestamp,
    ),
    speedMultiplier: normalizedExportSubset.speedMultiplier,
    terrainSettings: normalizedExportSubset.terrainSettings,
  };
}

function normalizeProjectState(rawProject = {}) {
  return {
    exportSettings: normalizeExportSettings(rawProject.exportSettings),
    mediaItems: Array.isArray(rawProject.mediaItems)
      ? rawProject.mediaItems
          .map((item) => normalizePersistedMediaItem(item))
          .filter((item) => item.filePath || item.id)
      : [],
    playback: normalizePlaybackSnapshot(rawProject.playback),
    schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
    track: normalizeTrackReference(rawProject.track),
  };
}

function serializeProjectState(rawProject = {}) {
  return JSON.stringify(normalizeProjectState(rawProject), null, 2);
}

function deserializeProjectState(serializedProject) {
  try {
    return normalizeProjectState(JSON.parse(serializedProject));
  } catch (error) {
    throw new Error(
      error instanceof SyntaxError
        ? "Project file is not valid JSON."
        : error.message,
    );
  }
}
// end F-54

module.exports = {
  PROJECT_STATE_SCHEMA_VERSION,
  deserializeProjectState,
  normalizePersistedMediaItem,
  normalizePlaybackSnapshot,
  normalizeProjectState,
  serializeProjectState,
};
