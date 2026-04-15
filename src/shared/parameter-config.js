function freezeDefinitionMap(definitions) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([key, definition]) => {
        return [key, Object.freeze({ ...definition })];
      }),
    ),
  );
}

function buildDefaults(definitions) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(definitions).map(([key, definition]) => {
        return [key, definition.default];
      }),
    ),
  );
}

const OVERLAY_VISIBILITY_FIELDS = freezeDefinitionMap({
  timeMetric: { type: "boolean", default: true },
  distanceMetric: { type: "boolean", default: true },
  altitudeMetric: { type: "boolean", default: true },
  cadenceMetric: { type: "boolean", default: true },
  temperatureMetric: { type: "boolean", default: false },
  speedGauge: { type: "boolean", default: true },
  heartRateGauge: { type: "boolean", default: true },
});

const CAMERA_SETTINGS_FIELDS = freezeDefinitionMap({
  followDistanceMeters: {
    type: "number",
    default: 500,
    min: 80,
    max: 800,
    step: 5,
  },
  followAltitudeOffsetMeters: {
    type: "number",
    default: 30,
    min: 2,
    max: 180,
    step: 1,
  },
  followPitchDegrees: {
    type: "number",
    default: 32,
    min: 15,
    max: 85,
    step: 1,
  },
  lookAheadDistanceMeters: {
    type: "number",
    default: 200,
    min: 10,
    max: 300,
    step: 1,
  },
  lookAheadPointWindow: {
    type: "integer",
    default: 24,
    min: 2,
    max: 60,
    step: 1,
  },
  smoothingStrength: {
    type: "number",
    default: 2,
    min: 0.25,
    max: 3,
    step: 0.05,
  },
  overviewPitchDegrees: {
    type: "number",
    default: 55,
    min: 20,
    max: 85,
    step: 1,
  },
  overviewRangeMultiplier: {
    type: "number",
    default: 2.8,
    min: 1,
    max: 6,
    step: 0.1,
  },
});

const EXPORT_SETTINGS_FIELDS = freezeDefinitionMap({
  fps: {
    type: "integer",
    default: 30,
    min: 1,
    step: 1,
  },
  speedMultiplier: {
    type: "number",
    default: 40,
    min: 0.1,
    step: 0.1,
  },
  adaptiveStrength: {
    type: "number",
    default: 2,
    min: 0.25,
    max: 3,
    step: 0.05,
  },
  settleTimeoutMs: {
    type: "integer",
    default: 15000,
    min: 1,
  },
  settleStablePasses: {
    type: "integer",
    default: 2,
    min: 1,
  },
  maxFrameRetries: {
    type: "integer",
    default: 1,
    min: 1,
  },
  speedGaugeMaxKph: {
    type: "number",
    default: 40,
    min: 10,
    step: 5,
  },
});

const MEDIA_PRESENTATION_SETTINGS_FIELDS = freezeDefinitionMap({
  photoDisplayDurationMs: {
    type: "integer",
    default: 3000,
    min: 1,
  },
  enterDurationMs: {
    type: "integer",
    default: 500,
    min: 1,
  },
  exitDurationMs: {
    type: "integer",
    default: 500,
    min: 1,
  },
  photoKenBurnsEnabled: {
    type: "boolean",
    default: true,
  },
  photoKenBurnsScale: {
    type: "number",
    default: 0.10,
    min: 0,
  },
});

const EXPORT_ENUM_DEFAULTS = Object.freeze({
  resolutionId: "landscape-360p",
  timingMode: "adaptive-speed",
  cameraMode: "follow",
});

const OVERLAY_VISIBILITY_DEFAULTS = buildDefaults(OVERLAY_VISIBILITY_FIELDS);
const CAMERA_SETTINGS_DEFAULTS = buildDefaults(CAMERA_SETTINGS_FIELDS);
const EXPORT_SETTINGS_DEFAULTS = buildDefaults(EXPORT_SETTINGS_FIELDS);
const MEDIA_PRESENTATION_DEFAULTS = buildDefaults(MEDIA_PRESENTATION_SETTINGS_FIELDS);

module.exports = {
  CAMERA_SETTINGS_DEFAULTS,
  CAMERA_SETTINGS_FIELDS,
  EXPORT_ENUM_DEFAULTS,
  EXPORT_SETTINGS_DEFAULTS,
  EXPORT_SETTINGS_FIELDS,
  MEDIA_PRESENTATION_DEFAULTS,
  MEDIA_PRESENTATION_SETTINGS_FIELDS,
  OVERLAY_VISIBILITY_DEFAULTS,
  OVERLAY_VISIBILITY_FIELDS,
};
