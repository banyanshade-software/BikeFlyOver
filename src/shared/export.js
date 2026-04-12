const EXPORT_RESOLUTION_PRESETS = [
  {
    id: "landscape-360p",
    label: "640 x 360 (Landscape)",
    width: 640,
    height: 360,
  },
  {
    id: "landscape-720p",
    label: "1280 x 720 (Landscape)",
    width: 1280,
    height: 720,
  },
  {
    id: "square-400",
    label: "400 x 400 (Square)",
    width: 400,
    height: 400,
  },
  {
    id: "square-1080",
    label: "1080 x 1080 (Square)",
    width: 1080,
    height: 1080,
  },
  {
    id: "portrait-360x640",
    label: "360 x 640 (Portrait)",
    width: 360,
    height: 640,
  },
  {
    id: "portrait-720x1280",
    label: "720 x 1280 (Portrait)",
    width: 720,
    height: 1280,
  },
];

const EXPORT_CAMERA_MODES = [
  { id: "follow", label: "Follow camera" },
  { id: "overview", label: "Overview camera" },
];

const EXPORT_DEFAULTS = {
  resolutionId: EXPORT_RESOLUTION_PRESETS[0].id,
  width: EXPORT_RESOLUTION_PRESETS[0].width,
  height: EXPORT_RESOLUTION_PRESETS[0].height,
  fps: 30,
  speedMultiplier: 40,
  cameraMode: EXPORT_CAMERA_MODES[0].id,
  settleTimeoutMs: 15000,
  settleStablePasses: 2,
  maxFrameRetries: 1,
};

function getResolutionPresetById(resolutionId) {
  return (
    EXPORT_RESOLUTION_PRESETS.find((preset) => preset.id === resolutionId) || null
  );
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Export setting "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function normalizePositiveNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Export setting "${fieldName}" must be a positive number.`);
  }

  return parsed;
}

function normalizeExportSettings(rawSettings = {}) {
  const resolutionId =
    rawSettings.resolutionId || EXPORT_DEFAULTS.resolutionId;
  const resolutionPreset = getResolutionPresetById(resolutionId);
  const width = resolutionPreset
    ? resolutionPreset.width
    : normalizePositiveInteger(rawSettings.width, "width");
  const height = resolutionPreset
    ? resolutionPreset.height
    : normalizePositiveInteger(rawSettings.height, "height");
  const fps = normalizePositiveInteger(
    rawSettings.fps ?? EXPORT_DEFAULTS.fps,
    "fps",
  );
  const speedMultiplier = normalizePositiveNumber(
    rawSettings.speedMultiplier ?? EXPORT_DEFAULTS.speedMultiplier,
    "speedMultiplier",
  );
  const settleTimeoutMs = normalizePositiveInteger(
    rawSettings.settleTimeoutMs ?? EXPORT_DEFAULTS.settleTimeoutMs,
    "settleTimeoutMs",
  );
  const settleStablePasses = normalizePositiveInteger(
    rawSettings.settleStablePasses ?? EXPORT_DEFAULTS.settleStablePasses,
    "settleStablePasses",
  );
  const maxFrameRetries = normalizePositiveInteger(
    rawSettings.maxFrameRetries ?? EXPORT_DEFAULTS.maxFrameRetries,
    "maxFrameRetries",
  );
  const cameraMode = EXPORT_CAMERA_MODES.some(
    (mode) => mode.id === rawSettings.cameraMode,
  )
    ? rawSettings.cameraMode
    : EXPORT_DEFAULTS.cameraMode;

  return {
    resolutionId,
    width,
    height,
    fps,
    speedMultiplier,
    cameraMode,
    settleTimeoutMs,
    settleStablePasses,
    maxFrameRetries,
  };
}

function computeExportFrameCount({
  startTimestamp,
  endTimestamp,
  fps,
  speedMultiplier,
}) {
  const durationMs = Math.max(0, endTimestamp - startTimestamp);

  if (durationMs === 0) {
    return 1;
  }

  const videoDurationSeconds = durationMs / (speedMultiplier * 1000);

  return Math.max(1, Math.ceil(videoDurationSeconds * fps) + 1);
}

function getExportActivityTimestamp({
  startTimestamp,
  endTimestamp,
  frameIndex,
  fps,
  speedMultiplier,
}) {
  const videoTimeSeconds = frameIndex / fps;
  const activityTimestamp =
    startTimestamp + videoTimeSeconds * speedMultiplier * 1000;

  return Math.min(endTimestamp, Math.max(startTimestamp, activityTimestamp));
}

function formatFrameFileName(frameNumber) {
  return `frame-${String(frameNumber).padStart(6, "0")}.png`;
}

module.exports = {
  EXPORT_CAMERA_MODES,
  EXPORT_DEFAULTS,
  EXPORT_RESOLUTION_PRESETS,
  computeExportFrameCount,
  formatFrameFileName,
  getExportActivityTimestamp,
  normalizeExportSettings,
};
