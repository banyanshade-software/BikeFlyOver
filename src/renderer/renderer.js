const EXPORT_OPTIONS = window.bikeFlyOverApp?.getExportOptions?.();
const MEDIA_ALIGNMENT_OPTIONS =
  window.bikeFlyOverApp?.getMediaAlignmentOptions?.();
const PARAMETER_CONFIG = EXPORT_OPTIONS?.parameterConfig || {};
const CAMERA_SETTINGS_FIELDS = PARAMETER_CONFIG.cameraSettings || {};
const EXPORT_SETTINGS_FIELDS = PARAMETER_CONFIG.exportSettings || {};
const MEDIA_PRESENTATION_SETTINGS_FIELDS = PARAMETER_CONFIG.mediaPresentation || {};
const MEDIA_ALIGNMENT_FIELD =
  MEDIA_ALIGNMENT_OPTIONS?.parameterConfig?.offsetSeconds || null;
// F-69: read shared terrain metadata in the renderer so terrain exaggeration stays aligned with export settings.
const TERRAIN_SETTINGS_FIELDS = PARAMETER_CONFIG.terrainSettings || {};
const DEFAULT_TERRAIN_PROVIDER_LABEL = "ArcGIS World Elevation";
const DEFAULT_TERRAIN_PROVIDER_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
// end F-69
// F-73: gauge size constants used to scale the speedometer proportionally to the export resolution
const _gaugeSizeCfg = PARAMETER_CONFIG.gaugeSizeConfig || {};
const OVERLAY_GAUGE_REFERENCE_PX = _gaugeSizeCfg.referenceGaugePx || 130;
const OVERLAY_GAUGE_MIN_PX = _gaugeSizeCfg.gaugeMinPx || 80;
const OVERLAY_GAUGE_MAX_PX = _gaugeSizeCfg.gaugeMaxPx || 400;
const OVERLAY_GAUGE_REFERENCE_WIDTH = _gaugeSizeCfg.referenceWidthPx || 1280;
// end F-73
const RENDER_MODE =
  new URLSearchParams(window.location.search).get("mode") === "export"
    ? "export"
    : "preview";

const exportUiState = {
  isExporting: false,
};
const SPEEDOMETER_PEAK_DECAY_KPH_PER_SECOND = 0.2;

const mediaLibraryState = {
  alignmentOffsets: MEDIA_ALIGNMENT_OPTIONS?.defaults || {
    cameraOffsetsByCameraId: {},
    mediaOffsetsByMediaId: {},
  },
  isImporting: false,
  items: [],
  statusMessage: "No media imported yet.",
  activePreviewItemId: null,
  previewEntities: [],
  previewRequestToken: 0,
  progress: {
    indeterminate: false,
    label: "Idle",
    status: "idle",
    value: 0,
  },
};
const TIMELINE_SLIDER_MAX = 1000;
const ROUTE_DISPLAY_HEIGHT_METERS = 2;
const OVERLAY_VISIBILITY_DEFAULTS = Object.freeze(
  Object.fromEntries(
    Object.entries(PARAMETER_CONFIG.overlayVisibility || {}).map(
      ([key, definition]) => {
        return [key, definition.default];
      },
    ),
  ),
);
const PRIMARY_METRIC_KEYS = Object.freeze([
  "timeMetric",
  "distanceMetric",
  "altitudeMetric",
  "cadenceMetric",
  "temperatureMetric",
]);
const OVERLAY_COMPONENT_DEFINITIONS = Object.freeze([
  {
    key: "timeMetric",
    checkboxId: "overlayTimeMetricCheckbox",
    elementId: "metricOverlayTimeCard",
  },
  {
    key: "distanceMetric",
    checkboxId: "overlayDistanceMetricCheckbox",
    elementId: "metricOverlayDistanceCard",
  },
  {
    key: "altitudeMetric",
    checkboxId: "overlayAltitudeMetricCheckbox",
    elementId: "metricOverlayAltitudeCard",
  },
  {
    key: "cadenceMetric",
    checkboxId: "overlayCadenceMetricCheckbox",
    elementId: "metricOverlayCadenceCard",
  },
  {
    key: "temperatureMetric",
    checkboxId: "overlayTemperatureMetricCheckbox",
    elementId: "metricOverlayTemperatureCard",
  },
  {
    key: "speedGauge",
    checkboxId: "overlaySpeedGaugeCheckbox",
    elementId: "metricOverlaySpeedGaugeCard",
  },
  {
    // F-74: independent text speed card — can be shown alongside or instead of the dial
    key: "speedText",
    checkboxId: "overlaySpeedTextCheckbox",
    elementId: "metricOverlaySpeedTextCard",
    // end F-74
  },
  {
    key: "heartRateGauge",
    checkboxId: "overlayHeartRateGaugeCheckbox",
    elementId: "metricOverlayHeartRateGaugeCard",
  },
]);
const TIMELINE_SCRUB_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function setStatus(message) {
  const statusElement = document.getElementById("status");

  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setRouteStatus(message) {
  const routeStatusElement = document.getElementById("routeStatus");

  if (routeStatusElement) {
    routeStatusElement.textContent = message;
  }
}

function setPlaybackButtonLabel(label) {
  const playPauseButton = document.getElementById("playPauseButton");

  if (playPauseButton) {
    playPauseButton.textContent = label;
  }
}

function setCameraModeButtonLabel(label) {
  const cameraModeButton = document.getElementById("cameraModeButton");

  if (cameraModeButton) {
    cameraModeButton.textContent = label;
  }
}

function setTextContent(elementId, value) {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = value;
  }
}

function setElementDisabled(elementId, disabled) {
  const element = document.getElementById(elementId);

  if (element instanceof HTMLInputElement || element instanceof HTMLButtonElement) {
    element.disabled = disabled;
    return;
  }

  if (element instanceof HTMLSelectElement) {
    element.disabled = disabled;
  }
}

function setElementHidden(elementId, hidden) {
  const element = document.getElementById(elementId);

  if (element instanceof HTMLElement) {
    element.hidden = hidden;
  }
}

function normalizeOverlayVisibilityState(rawVisibility = {}) {
  return OVERLAY_COMPONENT_DEFINITIONS.reduce((visibility, component) => {
    const fallback =
      EXPORT_OPTIONS.defaults?.overlayVisibility?.[component.key] ??
      OVERLAY_VISIBILITY_DEFAULTS[component.key];
    visibility[component.key] =
      typeof rawVisibility?.[component.key] === "boolean"
        ? rawVisibility[component.key]
        : fallback;
    return visibility;
  }, {});
}

function normalizeConfiguredNumber(value, definition, fallback) {
  const parsed =
    definition?.type === "integer" ? Number.parseInt(value, 10) : Number(value);
  let normalized = Number.isFinite(parsed) ? parsed : fallback;

  if (Number.isFinite(definition?.min)) {
    normalized = Math.max(definition.min, normalized);
  }

  if (Number.isFinite(definition?.max)) {
    normalized = Math.min(definition.max, normalized);
  }

  return normalized;
}

function normalizeSpeedGaugeMaxKph(value) {
  const definition = EXPORT_SETTINGS_FIELDS.speedGaugeMaxKph;

  return normalizeConfiguredNumber(
    value,
    definition,
      EXPORT_OPTIONS.defaults?.speedGaugeMaxKph ?? definition?.default,
  );
}

// F-21: keep media drift offsets normalized through the shared alignment helper so UI edits, preview, and export stay consistent.
function normalizeMediaAlignmentOffsets(rawOffsets = {}) {
  const normalized =
    window.bikeFlyOverApp?.normalizeMediaAlignmentOffsets?.(rawOffsets);

  if (normalized) {
    return normalized;
  }

  return {
    cameraOffsetsByCameraId: {},
    mediaOffsetsByMediaId: {},
  };
}

function normalizeMediaAlignmentOffsetValue(value) {
  return normalizeConfiguredNumber(
    value,
    MEDIA_ALIGNMENT_FIELD,
    MEDIA_ALIGNMENT_FIELD?.default ?? 0,
  );
}
// end F-21

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeCameraSettings(rawCameraSettings = {}) {
  const defaultCameraSettings = EXPORT_OPTIONS.defaults?.cameraSettings || {};
  const normalizeCameraSetting = (settingKey) => {
    const definition = CAMERA_SETTINGS_FIELDS[settingKey];
    const fallback =
      defaultCameraSettings[settingKey] ?? definition?.default ?? Number.NaN;

    return normalizeConfiguredNumber(
      rawCameraSettings[settingKey],
      definition,
      fallback,
    );
  };

  return {
    followDistanceMeters: normalizeCameraSetting("followDistanceMeters"),
    followAltitudeOffsetMeters: normalizeCameraSetting(
      "followAltitudeOffsetMeters",
    ),
    followPitchDegrees: normalizeCameraSetting("followPitchDegrees"),
    lookAheadDistanceMeters: normalizeCameraSetting("lookAheadDistanceMeters"),
    lookAheadPointWindow: normalizeCameraSetting("lookAheadPointWindow"),
    smoothingStrength: normalizeCameraSetting("smoothingStrength"),
    overviewPitchDegrees: normalizeCameraSetting("overviewPitchDegrees"),
    overviewRangeMultiplier: normalizeCameraSetting("overviewRangeMultiplier"),
  };
}

// F-69: normalize terrain settings in the renderer so exaggeration changes stay bounded and preview/export use the same values.
function normalizeTerrainSettings(rawTerrainSettings = {}) {
  const defaultTerrainSettings = EXPORT_OPTIONS.defaults?.terrainSettings || {};
  const normalizeTerrainSetting = (settingKey, fallbackValue) => {
    const definition = TERRAIN_SETTINGS_FIELDS[settingKey];
    const fallback =
      defaultTerrainSettings[settingKey] ?? definition?.default ?? fallbackValue;

    return normalizeConfiguredNumber(
      rawTerrainSettings[settingKey],
      definition,
      fallback,
    );
  };

  return {
    enabled:
      rawTerrainSettings.enabled === undefined
        ? defaultTerrainSettings.enabled ?? TERRAIN_SETTINGS_FIELDS.enabled?.default ?? true
        : Boolean(rawTerrainSettings.enabled),
    exaggeration: normalizeTerrainSetting("exaggeration", 1),
    routeOffsetMeters: normalizeTerrainSetting(
      "routeOffsetMeters",
      ROUTE_DISPLAY_HEIGHT_METERS,
    ),
  };
}

function setTerrainStatus(message) {
  setTextContent("terrainStatus", message);
}

function syncTerrainSettingsControls(playbackState) {
  const terrainSettings = normalizeTerrainSettings(playbackState.terrain.settings);
  const terrainEnabledCheckbox = document.getElementById("terrainEnabledCheckbox");
  const terrainExaggerationInput = document.getElementById(
    "terrainExaggerationInput",
  );

  playbackState.terrain.settings = terrainSettings;

  if (terrainEnabledCheckbox instanceof HTMLInputElement) {
    terrainEnabledCheckbox.checked = terrainSettings.enabled;
  }

  if (terrainExaggerationInput instanceof HTMLInputElement) {
    terrainExaggerationInput.value = String(terrainSettings.exaggeration);
    terrainExaggerationInput.disabled =
      !terrainSettings.enabled || exportUiState.isExporting;
  }

  if (!terrainSettings.enabled) {
    setTerrainStatus("3D terrain disabled.");
    return;
  }

  if (playbackState.terrain.providerError) {
    setTerrainStatus("3D terrain unavailable; using flat terrain fallback.");
    return;
  }

  if (playbackState.terrain.providerReady) {
    setTerrainStatus(
      `${playbackState.terrain.providerLabel || "3D terrain"} loaded (${terrainSettings.exaggeration.toFixed(1)}x exaggeration).`,
    );
    return;
  }

  setTerrainStatus("Loading 3D terrain...");
}
// end F-69

function setNumericInputValue(elementId, value) {
  const element = document.getElementById(elementId);

  if (element instanceof HTMLInputElement && Number.isFinite(value)) {
    element.value = String(value);
  }
}

function applyNumericDefinitionToElement(element, definition, options = {}) {
  if (!(element instanceof HTMLInputElement) || !definition) {
    return;
  }

  const formatValue = options.formatValue || ((value) => value);

  if (Number.isFinite(definition.min)) {
    element.min = String(formatValue(definition.min));
  } else {
    element.removeAttribute("min");
  }

  if (Number.isFinite(definition.max)) {
    element.max = String(formatValue(definition.max));
  } else {
    element.removeAttribute("max");
  }

  if (Number.isFinite(definition.step)) {
    element.step = String(formatValue(definition.step));
  }
}

function applyNumericInputDefinition(elementId, definition, options = {}) {
  const element = document.getElementById(elementId);
  applyNumericDefinitionToElement(element, definition, options);
}

function updateSpeedometerPeak(playbackState, currentSpeedKph) {
  const normalizedCurrentSpeedKph = Number.isFinite(currentSpeedKph)
    ? Math.max(0, currentSpeedKph)
    : 0;
  const previousPeakKph = Number.isFinite(playbackState.ui.speedGaugePeakKph)
    ? Math.max(0, playbackState.ui.speedGaugePeakKph)
    : 0;
  const previousTimestamp = Number.isFinite(playbackState.ui.speedGaugePeakTimestamp)
    ? playbackState.ui.speedGaugePeakTimestamp
    : playbackState.currentTimestamp;

  if (playbackState.currentTimestamp < previousTimestamp) {
    playbackState.ui.speedGaugePeakKph = normalizedCurrentSpeedKph;
    playbackState.ui.speedGaugePeakTimestamp = playbackState.currentTimestamp;
    return normalizedCurrentSpeedKph;
  }

  const elapsedSeconds = Math.max(
    0,
    (playbackState.currentTimestamp - previousTimestamp) / 1000,
  );
  const decayedPeakKph = Math.max(
    0,
    previousPeakKph - elapsedSeconds * SPEEDOMETER_PEAK_DECAY_KPH_PER_SECOND,
  );
  const nextPeakKph = Math.max(normalizedCurrentSpeedKph, decayedPeakKph);

  playbackState.ui.speedGaugePeakKph = nextPeakKph;
  playbackState.ui.speedGaugePeakTimestamp = playbackState.currentTimestamp;

  return nextPeakKph;
}

function syncOverlayControls(playbackState) {
  const overlayVisibility = normalizeOverlayVisibilityState(
    playbackState.ui.overlayVisibility,
  );
  const speedGaugeMaxInput = document.getElementById("overlaySpeedGaugeMaxInput");

  playbackState.ui.overlayVisibility = overlayVisibility;
  playbackState.ui.speedGaugeMaxKph = normalizeSpeedGaugeMaxKph(
    playbackState.ui.speedGaugeMaxKph,
  );

  for (const component of OVERLAY_COMPONENT_DEFINITIONS) {
    const checkbox = document.getElementById(component.checkboxId);

    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = overlayVisibility[component.key];
    }
  }

  if (speedGaugeMaxInput instanceof HTMLInputElement) {
    speedGaugeMaxInput.value = String(playbackState.ui.speedGaugeMaxKph);
  }
}

function applyOverlayVisibility(playbackState) {
  const overlayVisibility = normalizeOverlayVisibilityState(
    playbackState.ui.overlayVisibility,
  );
  const heartRateGaugeCard = document.getElementById("metricOverlayHeartRateGaugeCard");
  const heartRateGaugeAvailable =
    heartRateGaugeCard instanceof HTMLElement
      ? heartRateGaugeCard.dataset.available === "true"
      : false;
  const primaryVisible = PRIMARY_METRIC_KEYS.some((key) => overlayVisibility[key]);
  const secondaryVisible =
    overlayVisibility.speedGauge ||
    overlayVisibility.speedText ||
    (overlayVisibility.heartRateGauge && heartRateGaugeAvailable);

  playbackState.ui.overlayVisibility = overlayVisibility;

  for (const component of OVERLAY_COMPONENT_DEFINITIONS) {
    if (component.key === "heartRateGauge") {
      continue;
    }

    setElementHidden(component.elementId, !overlayVisibility[component.key]);
  }

  if (heartRateGaugeCard instanceof HTMLElement) {
    heartRateGaugeCard.hidden =
      !overlayVisibility.heartRateGauge || !heartRateGaugeAvailable;
  }

  setElementHidden("metricOverlayPrimaryColumn", !primaryVisible);
  setElementHidden("metricOverlaySecondaryColumn", !secondaryVisible);
  setElementHidden("metricOverlay", !(primaryVisible || secondaryVisible));
}

function setProgressState(elementIds, state) {
  const progressElement = document.getElementById(elementIds.bar);
  const label = state.label || "Idle";
  const value = Math.max(0, Math.min(100, Math.round(state.value || 0)));
  const status = state.status || "idle";
  const indeterminate = Boolean(state.indeterminate);

  setTextContent(elementIds.label, label);
  setTextContent(elementIds.value, indeterminate ? "Working..." : `${value}%`);

  if (!(progressElement instanceof HTMLProgressElement)) {
    return;
  }

  progressElement.classList.remove(
    "progress-bar--idle",
    "progress-bar--complete",
    "progress-bar--error",
    "progress-bar--indeterminate",
  );

  if (indeterminate) {
    progressElement.removeAttribute("value");
    progressElement.classList.add("progress-bar--indeterminate");
  } else {
    progressElement.value = value;
  }

  if (status === "complete") {
    progressElement.classList.add("progress-bar--complete");
  } else if (status === "error" || status === "cancelled") {
    progressElement.classList.add("progress-bar--error");
  } else if (status === "idle") {
    progressElement.classList.add("progress-bar--idle");
  }
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function formatBounds(bounds) {
  return [
    `${bounds.minLatitude.toFixed(5)} to ${bounds.maxLatitude.toFixed(5)} lat`,
    `${bounds.minLongitude.toFixed(5)} to ${bounds.maxLongitude.toFixed(5)} lon`,
  ].join(" / ");
}

function formatAltitude(bounds) {
  return `${bounds.minAltitude.toFixed(1)}m to ${bounds.maxAltitude.toFixed(1)}m`;
}

function formatProgress(progressRatio) {
  return `${(progressRatio * 100).toFixed(1)}%`;
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "N/A";
  }

  if (Math.abs(distanceMeters) >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatOverlaySpeed(speedMetersPerSecond) {
  if (!Number.isFinite(speedMetersPerSecond)) {
    return "N/A";
  }

  return `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatHeartRate(heartRate) {
  if (!Number.isFinite(heartRate)) {
    return "N/A";
  }

  return `${Math.round(heartRate)} bpm`;
}

function formatAltitudeValue(altitudeMeters) {
  if (!Number.isFinite(altitudeMeters)) {
    return "N/A";
  }

  return `${Math.round(altitudeMeters)} m`;
}

function formatCadenceValue(cadenceRpm) {
  if (!Number.isFinite(cadenceRpm)) {
    return "N/A";
  }

  return `${Math.round(cadenceRpm)} rpm`;
}

function formatTemperatureValue(temperatureCelsius) {
  if (!Number.isFinite(temperatureCelsius)) {
    return "N/A";
  }

  return `${temperatureCelsius.toFixed(1)} C`;
}

function getHeartRateGaugeState(heartRate) {
  const ratio = Number.isFinite(heartRate)
    ? Math.min(1, Math.max(0, heartRate / 180))
    : 0;

  if (!Number.isFinite(heartRate)) {
    return {
      fillClass: "metric-gauge__fill--heart-green",
      ratio,
    };
  }

  if (heartRate < 120) {
    return {
      fillClass: "metric-gauge__fill--heart-green",
      ratio,
    };
  }

  if (heartRate < 140) {
    return {
      fillClass: "metric-gauge__fill--heart-yellow",
      ratio,
    };
  }

  if (heartRate < 150) {
    return {
      fillClass: "metric-gauge__fill--heart-orange",
      ratio,
    };
  }

  return {
    fillClass: "metric-gauge__fill--heart-red",
    ratio,
  };
}

function clampProgressRatio(progressRatio) {
  if (!Number.isFinite(progressRatio)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progressRatio));
}

function getPlaybackProgressRatio(playbackState) {
  if (playbackState.durationMs <= 0) {
    return 1;
  }

  return clampProgressRatio(
    (playbackState.currentTimestamp - playbackState.startTimestamp) /
      playbackState.durationMs,
  );
}

function getFullPlaybackProgressRatio(playbackState, timestamp) {
  if (playbackState.fullDurationMs <= 0) {
    return 1;
  }

  return clampProgressRatio(
    ((timestamp ?? playbackState.currentTimestamp) -
      playbackState.fullStartTimestamp) /
      playbackState.fullDurationMs,
  );
}

function progressRatioToTimestamp(playbackState, progressRatio) {
  if (playbackState.durationMs <= 0) {
    return playbackState.startTimestamp;
  }

  return (
    playbackState.startTimestamp +
    playbackState.durationMs * clampProgressRatio(progressRatio)
  );
}

function fullProgressRatioToTimestamp(playbackState, progressRatio) {
  if (playbackState.fullDurationMs <= 0) {
    return playbackState.fullStartTimestamp;
  }

  return (
    playbackState.fullStartTimestamp +
    playbackState.fullDurationMs * clampProgressRatio(progressRatio)
  );
}

function sliderValueToTimestamp(playbackState, sliderValue) {
  return progressRatioToTimestamp(
    playbackState,
    Number(sliderValue) / TIMELINE_SLIDER_MAX,
  );
}

function fullSliderValueToTimestamp(playbackState, sliderValue) {
  return fullProgressRatioToTimestamp(
    playbackState,
    Number(sliderValue) / TIMELINE_SLIDER_MAX,
  );
}

function timestampToSliderValue(playbackState, timestamp) {
  if (playbackState.durationMs <= 0) {
    return TIMELINE_SLIDER_MAX;
  }

  return String(
    Math.round(
      TIMELINE_SLIDER_MAX *
        clampProgressRatio(
          (timestamp - playbackState.startTimestamp) / playbackState.durationMs,
        ),
    ),
  );
}

function fullTimestampToSliderValue(playbackState, timestamp) {
  if (playbackState.fullDurationMs <= 0) {
    return TIMELINE_SLIDER_MAX;
  }

  return String(
    Math.round(
      TIMELINE_SLIDER_MAX *
        getFullPlaybackProgressRatio(playbackState, timestamp),
    ),
  );
}

function getTrackpointIndexAtOrBefore(trackpoints, timestamp) {
  let low = 0;
  let high = trackpoints.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);

    if (trackpoints[middle].timestamp <= timestamp) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

function appendUniqueRoutePosition(Cesium, positions, position) {
  if (!position) {
    return;
  }

  const lastPosition = positions[positions.length - 1];

  if (
    !lastPosition ||
    !Cesium.Cartesian3.equalsEpsilon(
      lastPosition,
      position,
      Cesium.Math.EPSILON7,
    )
  ) {
    positions.push(position);
  }
}

function formatFrameProgress(currentFrame, totalFrames) {
  if (!Number.isFinite(totalFrames) || totalFrames < 1) {
    return "-";
  }

  return `${currentFrame} / ${totalFrames}`;
}

function getExportProgressState(statusUpdate) {
  const currentFrame = statusUpdate.currentFrame || 0;
  const totalFrames = statusUpdate.totalFrames || 0;
  const status = statusUpdate.status || "idle";
  const phase = statusUpdate.phase || "idle";

  if (status === "encoding") {
    return {
      indeterminate: true,
      label: "Encoding video",
      status: "running",
      value: 100,
    };
  }

  if (status === "complete") {
    return {
      indeterminate: false,
      label: "Export complete",
      status: "complete",
      value: 100,
    };
  }

  if (status === "failed") {
    return {
      indeterminate: false,
      label: "Export failed",
      status: "error",
      value: totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 100,
    };
  }

  if (status === "cancelled") {
    return {
      indeterminate: false,
      label: "Export cancelled",
      status: "cancelled",
      value: totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0,
    };
  }

  if (["starting", "running"].includes(status)) {
    return {
      indeterminate: false,
      label: phase === "preparing" ? "Preparing frames" : "Rendering frames",
      status: "running",
      value: totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0,
    };
  }

  return {
    indeterminate: false,
    label: "Idle",
    status: "idle",
    value: 0,
  };
}

function formatMediaType(mediaType) {
  return mediaType === "video" ? "Video" : "Image";
}

function formatTimestampMetadataStatus(status) {
  if (status === "extracted") {
    return "Timestamp metadata extracted";
  }

  if (status === "missing") {
    return "Timestamp metadata unavailable";
  }

  if (status === "error") {
    return "Timestamp metadata read failed";
  }

  return "Timestamp metadata unknown";
}

function formatMediaTimestampDetails(item) {
  if (item.timestampMetadataStatus === "extracted" && item.capturedAt) {
    return `${formatTimestamp(item.capturedAt)} · ${item.timestampSource}`;
  }

  if (item.timestampMetadataStatus === "missing") {
    return "No usable timestamp metadata found";
  }

  if (item.timestampMetadataStatus === "error") {
    return item.timestampMetadataError || "Metadata extraction failed";
  }

  return "Timestamp metadata pending extraction";
}

// F-21: show camera grouping and effective correction source so users can manage per-camera and per-media drift fixes.
function formatSignedOffsetSeconds(valueSeconds) {
  const absoluteSeconds = Math.abs(valueSeconds);
  const normalizedSeconds = Number.isInteger(absoluteSeconds)
    ? absoluteSeconds
    : Number(absoluteSeconds.toFixed(2));

  return `${valueSeconds >= 0 ? "+" : "-"}${normalizedSeconds}s`;
}

function formatMediaCorrectionModelSummary(items) {
  const detectedCameraCount = getDetectedCameraGroups(items).length;

  if (detectedCameraCount === 0) {
    return "Per-media correction only until camera metadata is available.";
  }

  return `${detectedCameraCount} detected camera${detectedCameraCount === 1 ? "" : "s"} with optional per-media overrides.`;
}

function formatAdjustedMediaTimestampDetails(item) {
  if (!item.adjustedCapturedAt) {
    return "No corrected capture time available";
  }

  if (!item.appliedAlignmentOffsetMs) {
    return `Effective capture ${formatTimestamp(item.adjustedCapturedAt)} · no correction`;
  }

  const sourceLabel =
    item.appliedAlignmentOffsetSource === "media"
      ? "per-media override"
      : item.appliedAlignmentOffsetSource === "camera"
        ? "camera offset"
        : "no correction";

  return `Effective capture ${formatTimestamp(item.adjustedCapturedAt)} · ${sourceLabel} ${formatSignedOffsetSeconds(item.appliedAlignmentOffsetSeconds ?? 0)}`;
}

function formatMediaCameraIdentity(item) {
  if (!item.cameraIdentityLabel) {
    return "Camera identity unavailable · per-media correction only";
  }

  return item.cameraIdentitySource
    ? `${item.cameraIdentityLabel} · ${item.cameraIdentitySource}`
    : item.cameraIdentityLabel;
}
// end F-21

function formatMediaAlignmentStatus(status) {
  if (status === "aligned") {
    return "Aligned to activity timeline";
  }

  if (status === "before-start") {
    return "Captured before activity start";
  }

  if (status === "after-end") {
    return "Captured after activity end";
  }

  if (status === "missing-timestamp") {
    return "Cannot align without timestamp metadata";
  }

  return "Alignment pending";
}

function formatMediaAlignmentDetails(item) {
  if (!item.alignedActivityTime) {
    return "No aligned activity position available";
  }

  const trackpointLabel =
    item.nearestTrackIndex === null
      ? "no trackpoint"
      : `trackpoint ${item.nearestTrackIndex + 1}`;

  return `${formatTimestamp(item.alignedActivityTime)} · ${trackpointLabel}`;
}

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function getMediaPreviewUrl(filePath) {
  return window.bikeFlyOverApp?.toFileUrl?.(filePath) || "";
}

function getImagePreviewUrl(item) {
  return item.previewUrl || "";
}

function getMediaDurationMs(item) {
  const candidates = [item?.mediaDurationMs, item?.durationMs];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return 0;
}

function formatMediaDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return formatDuration(durationMs);
}

function readMediaPresentationSettings() {
  const photoDisplayDurationInput = document.getElementById(
    "photoDisplayDurationInput",
  );
  const photoKenBurnsCheckbox = document.getElementById("photoKenBurnsCheckbox");
  // F-76
  const mediaAnimationEffectSelect = document.getElementById("mediaAnimationEffectSelect");
  const photoAllowCropCheckbox = document.getElementById("photoAllowCropCheckbox");
  // end F-76
  const photoDisplayDefinition =
    MEDIA_PRESENTATION_SETTINGS_FIELDS.photoDisplayDurationMs;
  const parsedPhotoDisplaySeconds =
    photoDisplayDurationInput instanceof HTMLInputElement
      ? Number(photoDisplayDurationInput.value)
      : Number.NaN;

  return {
    enterDurationMs: EXPORT_OPTIONS.defaults.enterDurationMs,
    exitDurationMs: EXPORT_OPTIONS.defaults.exitDurationMs,
    photoDisplayDurationMs: Number.isFinite(parsedPhotoDisplaySeconds)
      ? Math.max(
          photoDisplayDefinition?.min ?? 1,
          Math.round(parsedPhotoDisplaySeconds * 1000),
        )
      : EXPORT_OPTIONS.defaults.photoDisplayDurationMs,
    photoKenBurnsEnabled:
      photoKenBurnsCheckbox instanceof HTMLInputElement
        ? photoKenBurnsCheckbox.checked
        : EXPORT_OPTIONS.defaults.photoKenBurnsEnabled,
    photoKenBurnsScale:
      MEDIA_PRESENTATION_SETTINGS_FIELDS.photoKenBurnsScale?.default ?? 0,
    // F-76
    animationEffect:
      mediaAnimationEffectSelect instanceof HTMLSelectElement
        ? mediaAnimationEffectSelect.value
        : EXPORT_OPTIONS.defaults.animationEffect,
    imageFit:
      photoAllowCropCheckbox instanceof HTMLInputElement && photoAllowCropCheckbox.checked
        ? "cover"
        : "contain",
    // end F-76
  };
}

function getMediaPresentationTimeline(item, settings) {
  if (!item || !Number.isFinite(item.alignedActivityTimestamp)) {
    return null;
  }

  if (item.mediaType === "video") {
    const durationMs = getMediaDurationMs(item);

    if (durationMs <= 0) {
      return null;
    }

    const enterDurationMs = Math.min(settings.enterDurationMs, durationMs / 3);
    const exitDurationMs = Math.min(settings.exitDurationMs, durationMs / 3);

    return {
      enterDurationMs,
      exitDurationMs,
      holdDurationMs: Math.max(0, durationMs - enterDurationMs - exitDurationMs),
      totalDurationMs: durationMs,
      videoCurrentTimeMs: durationMs,
    };
  }

  return {
    enterDurationMs: settings.enterDurationMs,
    exitDurationMs: settings.exitDurationMs,
    holdDurationMs: settings.photoDisplayDurationMs,
    totalDurationMs:
      settings.enterDurationMs +
      settings.photoDisplayDurationMs +
      settings.exitDurationMs,
    videoCurrentTimeMs: 0,
  };
}

function buildMediaPresentationState(item, elapsedMs, settings) {
  const timeline = getMediaPresentationTimeline(item, settings);

  if (!timeline) {
    return null;
  }

  const safeElapsedMs = Math.min(
    timeline.totalDurationMs,
    Math.max(0, elapsedMs),
  );
  const exitStartMs = Math.max(
    timeline.enterDurationMs + timeline.holdDurationMs,
    timeline.totalDurationMs - timeline.exitDurationMs,
  );
  let opacity = 1;
  let translateY = 0;
  let translateX = 0;
  let scale = 1;

  // F-76: compute effect-specific transforms based on the chosen animation effect.
  const effect = settings?.animationEffect ?? "slide-up";

  function applyEnterTransforms(p) {
    switch (effect) {
      case "slide-up":
        translateY = 18 * (1 - p);
        scale = 0.94 + 0.06 * p;
        break;
      case "slide-down":
        translateY = -18 * (1 - p);
        scale = 0.94 + 0.06 * p;
        break;
      case "slide-left":
        translateX = 24 * (1 - p);
        break;
      case "zoom":
        scale = 0.85 + 0.15 * p;
        break;
      case "fade":
      case "none":
      default:
        break;
    }
  }

  function applyExitTransforms(p) {
    switch (effect) {
      case "slide-up":
        translateY = -10 * p;
        scale = 1 + 0.03 * p;
        break;
      case "slide-down":
        translateY = 10 * p;
        scale = 1 + 0.03 * p;
        break;
      case "slide-left":
        translateX = -18 * p;
        break;
      case "zoom":
        scale = 1 + 0.1 * p;
        break;
      case "fade":
      case "none":
      default:
        break;
    }
  }

  if (timeline.enterDurationMs > 0 && safeElapsedMs < timeline.enterDurationMs) {
    const enterProgress = safeElapsedMs / timeline.enterDurationMs;

    opacity = enterProgress;
    applyEnterTransforms(enterProgress);
  } else if (timeline.exitDurationMs > 0 && safeElapsedMs > exitStartMs) {
    const exitProgress = Math.min(
      1,
      (safeElapsedMs - exitStartMs) / timeline.exitDurationMs,
    );

    opacity = 1 - exitProgress;
    applyExitTransforms(exitProgress);
  }
  // end F-76

  const progressRatio =
    timeline.totalDurationMs > 0 ? safeElapsedMs / timeline.totalDurationMs : 1;

  return {
    elapsedMs: safeElapsedMs,
    // F-76: include translateX and imageFit so the overlay renderer doesn't need to re-read settings.
    imageFit: settings?.imageFit ?? "contain",
    imageScale:
      item.mediaType === "image" && settings.photoKenBurnsEnabled
        ? 1 + settings.photoKenBurnsScale * progressRatio
        : 1,
    opacity,
    scale,
    totalDurationMs: timeline.totalDurationMs,
    translateX,
    translateY,
    // end F-76
    videoCurrentTimeMs:
      item.mediaType === "video"
        ? Math.min(safeElapsedMs, getMediaDurationMs(item))
        : 0,
  };
}

// F-67: compute the single active media item whose aligned timestamp window covers the current playback position
function getActivePreviewMediaPresentation(playbackTimestamp) {
  const settings = readMediaPresentationSettings();
  let bestMatch = null;

  for (const item of mediaLibraryState.items) {
    if (!Number.isFinite(item.alignedActivityTimestamp)) {
      continue;
    }

    const timeline = getMediaPresentationTimeline(item, settings);

    if (!timeline) {
      continue;
    }

    const startTimestamp = item.alignedActivityTimestamp;
    const endTimestamp = startTimestamp + timeline.totalDurationMs;

    if (playbackTimestamp < startTimestamp || playbackTimestamp > endTimestamp) {
      continue;
    }

    if (
      !bestMatch ||
      startTimestamp > bestMatch.startTimestamp ||
      (startTimestamp === bestMatch.startTimestamp &&
        item.fileName.localeCompare(bestMatch.item.fileName) < 0)
    ) {
      bestMatch = {
        item,
        startTimestamp,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    item: bestMatch.item,
    ...buildMediaPresentationState(
      bestMatch.item,
      playbackTimestamp - bestMatch.startTimestamp,
      settings,
    ),
  };
}
// end F-67

// F-67: resolve a safe renderer-side preview URL for each media item so the overlay can display images and videos without privileged paths
function decorateMediaItemsForPreview(mediaItems) {
  return mediaItems.map((item) => {
    return {
      ...item,
      previewUrl:
        item.mediaType === "image"
          ? getImagePreviewUrl(item)
          : item.previewUrl || getMediaPreviewUrl(item.filePath),
    };
  });
}
// end F-67

function createMediaPreviewMarkerImage(item) {
  const kindLabel = item.mediaType === "video" ? "VIDEO" : "PHOTO";
  const fileLabel = escapeSvgText(truncateText(item.fileName, 18));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="176" height="104" viewBox="0 0 176 104">
      <rect x="4" y="4" width="168" height="96" rx="14" fill="rgba(7,18,29,0.92)" stroke="rgba(121,189,255,0.7)" stroke-width="4"/>
      <rect x="16" y="16" width="144" height="50" rx="10" fill="${item.mediaType === "video" ? "rgba(24,71,107,0.95)" : "rgba(20,88,124,0.95)"}"/>
      <text x="88" y="47" text-anchor="middle" fill="#f4f8fb" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${kindLabel}</text>
      <text x="16" y="82" fill="#79bdff" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">${kindLabel}</text>
      <text x="16" y="95" fill="#f4f8fb" font-family="Inter, Arial, sans-serif" font-size="12">${fileLabel}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clearMediaPreviewEntities(viewer) {
  if (!viewer) {
    mediaLibraryState.previewEntities = [];
    return;
  }

  for (const entity of mediaLibraryState.previewEntities) {
    viewer.entities.remove(entity);
  }

  mediaLibraryState.previewEntities = [];
}

function syncMediaPreviewEntities(viewer, playbackState) {
  const Cesium = window.Cesium;

  clearMediaPreviewEntities(viewer);

  if (!Cesium) {
    return;
  }

  mediaLibraryState.previewEntities = mediaLibraryState.items
    .filter((item) => {
      return item.alignmentStatus === "aligned" && Number.isFinite(item.nearestTrackIndex);
    })
    .map((item) => {
      const position = playbackState.routePositions[item.nearestTrackIndex];

      if (!position) {
        return null;
      }

      return viewer.entities.add({
        id: `media-preview-${item.id}`,
        position,
        billboard: {
          image: createMediaPreviewMarkerImage(item),
          width: 88,
          height: 52,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(200, 1, 4500, 0.55),
        },
      });
    })
    .filter(Boolean);
}

function setMediaPreviewEntitiesVisibility(visible) {
  for (const entity of mediaLibraryState.previewEntities) {
    entity.show = visible;
  }
}

// F-67: hide and clean up the preview overlay when no media is active at the current playback position
function hideMediaPreviewOverlay() {
  mediaLibraryState.previewRequestToken += 1;
  const overlayElement = document.getElementById("mediaPreviewOverlay");
  const imageElement = document.getElementById("mediaPreviewImage");
  const videoElement = document.getElementById("mediaPreviewVideo");

  if (overlayElement instanceof HTMLElement) {
    overlayElement.hidden = true;
  }

  if (imageElement instanceof HTMLDivElement) {
    imageElement.hidden = true;
    imageElement.style.backgroundImage = "";
    imageElement.style.transform = "";
    delete imageElement.dataset.previewUrl;
  }

  if (videoElement instanceof HTMLVideoElement) {
    videoElement.pause();
    videoElement.hidden = true;
    videoElement.style.transform = "";
  }

  mediaLibraryState.activePreviewItemId = null;
}
// end F-67

function resolveMediaPresentationForRender(playbackState, options = {}) {
  const hasExplicitMediaPresentation = Object.prototype.hasOwnProperty.call(
    options,
    "activeMedia",
  );

  if (hasExplicitMediaPresentation) {
    return options.activeMedia && Number.isFinite(options.activeMedia.elapsedMs)
      ? {
          item: mediaLibraryState.items.find((item) => {
            return item.id === options.activeMedia.itemId;
          }),
          ...options.activeMedia,
        }
      : null;
  }

  return getActivePreviewMediaPresentation(playbackState.currentTimestamp);
}

// F-67: update the badge, filename, and aligned-time labels on the preview card
function updateMediaPreviewMetadata(activeItem, presentation) {
  setTextContent("mediaPreviewType", formatMediaType(activeItem.mediaType));
  setTextContent("mediaPreviewName", activeItem.fileName);

  if (activeItem.mediaType === "video" && Number.isFinite(presentation.elapsedMs)) {
    const progressLabel = [
      formatMediaDuration(presentation.videoCurrentTimeMs),
      formatMediaDuration(getMediaDurationMs(activeItem)),
    ]
      .filter(Boolean)
      .join(" / ");

    setTextContent(
      "mediaPreviewTime",
      activeItem.alignedActivityTime
        ? `Aligned at ${formatTimestamp(activeItem.alignedActivityTime)}${progressLabel ? ` · ${progressLabel}` : ""}`
        : progressLabel || "Aligned media preview",
    );
    return;
  }

  setTextContent(
    "mediaPreviewTime",
    activeItem.alignedActivityTime
      ? `Aligned at ${formatTimestamp(activeItem.alignedActivityTime)}`
      : "Aligned media preview",
  );
}
// end F-67

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      resolve();
    });
  });
}

function waitForMediaElementEvent(target, eventName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };

    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Media element failed while waiting for ${eventName}.`));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for media event "${eventName}".`));
    }, timeoutMs);

    target.addEventListener(eventName, onEvent, {
      once: true,
    });
    target.addEventListener("error", onError, {
      once: true,
    });
  });
}

function preloadImageSource(src, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const imageProbe = new Image();
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      imageProbe.removeEventListener("load", onLoad);
      imageProbe.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Image preview unavailable"));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for image preview."));
    }, timeoutMs);

    imageProbe.addEventListener("load", onLoad, {
      once: true,
    });
    imageProbe.addEventListener("error", onError, {
      once: true,
    });
    imageProbe.decoding = "async";
    imageProbe.src = src;
  });
}

async function syncPreviewVideoFrame(videoElement, item, currentTimeMs) {
  const previewUrl = item.previewUrl || getMediaPreviewUrl(item.filePath);

  if (!previewUrl) {
    throw new Error("Video preview URL is unavailable.");
  }

  if (videoElement.dataset.mediaItemId !== item.id || videoElement.src !== previewUrl) {
    videoElement.dataset.mediaItemId = item.id;
    videoElement.src = previewUrl;
    videoElement.load();
  }

  if (videoElement.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForMediaElementEvent(videoElement, "loadedmetadata");
  }

  const durationSeconds = Math.max(
    0,
    (Number.isFinite(videoElement.duration) ? videoElement.duration : 0) ||
      getMediaDurationMs(item) / 1000,
  );
  const safeCurrentTimeSeconds =
    durationSeconds > 0
      ? Math.max(0, Math.min(currentTimeMs / 1000, durationSeconds - 0.001))
      : 0;

  if (Math.abs(videoElement.currentTime - safeCurrentTimeSeconds) > 0.04) {
    const seekedPromise = waitForMediaElementEvent(videoElement, "seeked");

    videoElement.currentTime = safeCurrentTimeSeconds;
    await seekedPromise;
  }

  videoElement.pause();
  await waitForAnimationFrame();
}

// F-67: async overlay driver - shows image thumbnail or seeked video frame for the active media item, hides when no active item
async function updateMediaPreviewOverlay(playbackState, options = {}) {
  const requestToken = ++mediaLibraryState.previewRequestToken;
  const overlayElement = document.getElementById("mediaPreviewOverlay");
  const cardElement = document.getElementById("mediaPreviewCard");
  const imageElement = document.getElementById("mediaPreviewImage");
  const videoElement = document.getElementById("mediaPreviewVideo");
  const fallbackElement = document.getElementById("mediaPreviewFallback");
  const fallbackLabelElement = document.getElementById("mediaPreviewFallbackLabel");

  if (
    !(overlayElement instanceof HTMLElement) ||
    !(cardElement instanceof HTMLElement) ||
    !(imageElement instanceof HTMLDivElement) ||
    !(videoElement instanceof HTMLVideoElement) ||
    !(fallbackElement instanceof HTMLDivElement) ||
    !(fallbackLabelElement instanceof HTMLElement)
  ) {
    return;
  }

  const activeMedia = Object.prototype.hasOwnProperty.call(options, "activeMedia")
    ? options.activeMedia
    : options.exportActiveMedia;
  const presentation = resolveMediaPresentationForRender(playbackState, {
    activeMedia,
  });

  if (!presentation || !presentation.item) {
    hideMediaPreviewOverlay();
    return;
  }

  const { item: activeItem, imageFit, imageScale, opacity, scale, translateX, translateY } = presentation;

  cardElement.style.opacity = String(opacity);
  cardElement.style.transform = `translateY(${translateY}px) translateX(${translateX ?? 0}px) scale(${scale})`;
  imageElement.style.transform = `scale(${imageScale})`;
  videoElement.style.transform = `scale(${imageScale})`;
  // F-76: apply image fit (contain = letterbox, cover = crop to fill).
  imageElement.style.backgroundSize = imageFit === "cover" ? "cover" : "contain";
  imageElement.style.backgroundColor = "#000";
  videoElement.style.objectFit = imageFit === "cover" ? "cover" : "contain";
  // end F-76

  updateMediaPreviewMetadata(activeItem, presentation);

  mediaLibraryState.activePreviewItemId = activeItem.id;

  if (activeItem.mediaType === "image" && activeItem.previewUrl) {
    videoElement.pause();
    videoElement.hidden = true;
    fallbackElement.hidden = false;
    fallbackLabelElement.textContent = "Loading image preview...";
    imageElement.hidden = true;

    try {
      if (
        imageElement.dataset.mediaItemId !== activeItem.id ||
        imageElement.dataset.previewUrl !== activeItem.previewUrl
      ) {
        imageElement.dataset.mediaItemId = activeItem.id;
        await preloadImageSource(activeItem.previewUrl);
        imageElement.dataset.previewUrl = activeItem.previewUrl;
        imageElement.style.backgroundImage = `url("${activeItem.previewUrl}")`;
      }

      if (requestToken !== mediaLibraryState.previewRequestToken) {
        return;
      }

      fallbackElement.hidden = true;
      imageElement.hidden = false;
      await waitForAnimationFrame();
    } catch (error) {
      imageElement.hidden = true;
      fallbackElement.hidden = false;
      fallbackLabelElement.textContent =
        error instanceof Error ? error.message : "Image preview unavailable";
    }
  } else if (activeItem.mediaType === "video" && getMediaDurationMs(activeItem) > 0) {
    imageElement.hidden = true;
    imageElement.style.backgroundImage = "";
    delete imageElement.dataset.previewUrl;
    fallbackElement.hidden = true;
    videoElement.hidden = false;

    try {
      await syncPreviewVideoFrame(
        videoElement,
        activeItem,
        presentation.videoCurrentTimeMs,
      );

      if (requestToken !== mediaLibraryState.previewRequestToken) {
        return;
      }
    } catch (error) {
      videoElement.hidden = true;
      fallbackElement.hidden = false;
      fallbackLabelElement.textContent =
        error instanceof Error ? error.message : "Video clip preview unavailable";
    }
  } else {
    imageElement.hidden = true;
    imageElement.style.backgroundImage = "";
    delete imageElement.dataset.previewUrl;
    videoElement.pause();
    videoElement.hidden = true;
    fallbackElement.hidden = false;
    fallbackLabelElement.textContent =
      activeItem.mediaType === "video"
        ? "Video duration unavailable"
        : "Preview unavailable";
  }

  overlayElement.hidden = false;
}
// end F-67

function renderSummary(sampleTrack) {
  const summaryList = document.getElementById("summaryList");

  if (!summaryList) {
    return;
  }

  const { fileName, summary } = sampleTrack;

  summaryList.innerHTML = `
    <div>
      <dt>File</dt>
      <dd>${fileName}</dd>
    </div>
    <div>
      <dt>Trackpoints</dt>
      <dd>${summary.pointCount.toLocaleString()}</dd>
    </div>
    <div>
      <dt>Start</dt>
      <dd>${formatTimestamp(summary.startTime)}</dd>
    </div>
    <div>
      <dt>End</dt>
      <dd>${formatTimestamp(summary.endTime)}</dd>
    </div>
    <div>
      <dt>Bounds</dt>
      <dd>${formatBounds(summary.bounds)}</dd>
    </div>
    <div>
      <dt>Altitude</dt>
      <dd>${formatAltitude(summary.bounds)}</dd>
    </div>
    <div>
      <dt>Route</dt>
      <dd id="routeStatus">Waiting for render...</dd>
    </div>
  `;
}

function createPlaybackState(trackpoints, options = {}) {
  const fullStartTimestamp = trackpoints[0].timestamp;
  const fullEndTimestamp = trackpoints[trackpoints.length - 1].timestamp;

  return {
    trackpoints,
    fullStartTimestamp,
    fullEndTimestamp,
    fullDurationMs: fullEndTimestamp - fullStartTimestamp,
    startTimestamp: fullStartTimestamp,
    endTimestamp: fullEndTimestamp,
    durationMs: fullEndTimestamp - fullStartTimestamp,
    currentTimestamp: fullStartTimestamp,
    currentIndex: 0,
    currentSample: trackpoints[0],
    isPlaying: false,
    speedMultiplier: options.speedMultiplier ?? EXPORT_OPTIONS.defaults.speedMultiplier,
    lastFrameTime: null,
    animationFrameId: null,
    markerEntity: null,
    progressEntity: null,
    currentSamplePosition: null,
    playedRoutePositionsScratch: [],
    routePositions: [],
    // F-69: keep terrain state in playback so route geometry and export snapshots can share the same exaggeration/source data.
    terrain: {
      flatProvider: null,
      providerError: null,
      providerLabel: DEFAULT_TERRAIN_PROVIDER_LABEL,
      provider: null,
      providerReady: false,
      sampledHeights: [],
      settings: normalizeTerrainSettings(
        options.terrainSettings ?? EXPORT_OPTIONS.defaults.terrainSettings,
      ),
    },
    route: {
      afterRangeEntity: null,
      beforeRangeEntity: null,
      endEntity: null,
      startEntity: null,
    },
    // end F-69
    camera: {
      mode: options.cameraMode ?? EXPORT_OPTIONS.defaults.cameraMode,
      adaptiveStrength:
        options.adaptiveStrength ?? EXPORT_OPTIONS.defaults.adaptiveStrength,
      settings: normalizeCameraSettings(
        options.cameraSettings ?? EXPORT_OPTIONS.defaults.cameraSettings,
      ),
      smoothedFocus: null,
      smoothedHeading: null,
      routeBoundingSphere: null,
      routeEntity: null,
    },
    export: {
      cancelRequested: false,
    },
    ui: {
      isTimelineInteracting: false,
      resumePlaybackAfterTimelineInteraction: false,
      overlayVisibility: normalizeOverlayVisibilityState(
        options.overlayVisibility ?? EXPORT_OPTIONS.defaults.overlayVisibility,
      ),
      speedGaugeMaxKph: normalizeSpeedGaugeMaxKph(
        options.speedGaugeMaxKph ?? EXPORT_OPTIONS.defaults.speedGaugeMaxKph,
      ),
      speedGaugePeakKph: 0,
      speedGaugePeakTimestamp: fullStartTimestamp,
    },
  };
}

function mergeImportedMedia(existingItems, importedItems) {
  const byPath = new Map(
    existingItems.map((item) => {
      return [item.filePath, item];
    }),
  );

  for (const item of importedItems) {
    byPath.set(item.filePath, item);
  }

  return Array.from(byPath.values());
}

// F-21: route all media re-alignment through the shared preload helper so offsets affect preview and export the same way.
function alignMediaLibraryItemsToTrack(mediaItems, trackpoints) {
  const aligner = window.bikeFlyOverApp?.alignMediaItemsToTrack;

  if (typeof aligner !== "function") {
    throw new Error("Shared media alignment helpers are unavailable.");
  }

  return aligner(mediaItems, trackpoints, mediaLibraryState.alignmentOffsets);
}
// end F-21

function createBaseLayer(Cesium) {
  const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromBasemapType(
      Cesium.ArcGisBaseMapType.SATELLITE,
    ),
  );

  baseLayer.readyEvent.addEventListener(() => {
    setRouteStatus("Satellite basemap loaded.");
  });

  baseLayer.errorEvent.addEventListener((error) => {
    console.error("Base imagery failed to load:", error);
    setRouteStatus("Satellite basemap failed to load.");
  });

  return baseLayer;
}

// F-69: sample terrain-backed route heights and rebuild route geometry so the fly-over stays attached to exaggerated terrain.
function getTerrainDisplayHeight(playbackState, trackpointIndex) {
  const sampledHeight = playbackState.terrain.sampledHeights[trackpointIndex];
  const terrainSettings = normalizeTerrainSettings(playbackState.terrain.settings);

  if (!terrainSettings.enabled) {
    return terrainSettings.routeOffsetMeters;
  }

  return (
    (Number.isFinite(sampledHeight) ? sampledHeight : 0) *
      terrainSettings.exaggeration +
    terrainSettings.routeOffsetMeters
  );
}

function buildRoutePositions(Cesium, playbackState) {
  return playbackState.trackpoints.map((trackpoint, trackpointIndex) =>
    Cesium.Cartesian3.fromDegrees(
      trackpoint.longitude,
      trackpoint.latitude,
      getTerrainDisplayHeight(playbackState, trackpointIndex),
    ),
  );
}

async function sampleRouteTerrainHeights(viewer, playbackState) {
  const Cesium = window.Cesium;

  if (
    !Cesium ||
    !normalizeTerrainSettings(playbackState.terrain.settings).enabled ||
    !playbackState.terrain.providerReady ||
    !viewer?.terrainProvider ||
    viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider
  ) {
    playbackState.terrain.sampledHeights = playbackState.trackpoints.map(() => 0);
    return;
  }

  const cartographics = playbackState.trackpoints.map((trackpoint) => {
    return Cesium.Cartographic.fromDegrees(
      trackpoint.longitude,
      trackpoint.latitude,
      0,
    );
  });
  const sampledCartographics = await Cesium.sampleTerrainMostDetailed(
    viewer.terrainProvider,
    cartographics,
  );

  playbackState.terrain.sampledHeights = sampledCartographics.map((cartographic) => {
    return Number.isFinite(cartographic?.height) ? cartographic.height : 0;
  });
}

function applyRoutePositionsToEntities(playbackState) {
  const Cesium = window.Cesium;
  const routePositions = buildRoutePositions(Cesium, playbackState);
  const routeBoundingSphere = Cesium.BoundingSphere.fromPoints(routePositions);
  const startPosition = routePositions[0] || null;
  const endPosition = routePositions[routePositions.length - 1] || null;

  playbackState.routePositions = routePositions;
  playbackState.camera.routeBoundingSphere = routeBoundingSphere;

  syncRouteRangeEntities(playbackState);

  if (playbackState.route.startEntity) {
    playbackState.route.startEntity.position = startPosition;
  }

  if (playbackState.route.endEntity) {
    playbackState.route.endEntity.position = endPosition;
  }
}

async function refreshTerrainRouteGeometry(viewer, playbackState, options = {}) {
  const { resampleHeights = false, updateTimelineState = true } = options;

  if (resampleHeights || playbackState.terrain.sampledHeights.length === 0) {
    await sampleRouteTerrainHeights(viewer, playbackState);
  }

  applyRoutePositionsToEntities(playbackState);

  if (updateTimelineState) {
    setPlaybackTimestamp(viewer, playbackState, playbackState.currentTimestamp, {
      updateMediaPreview: false,
      updateUi: RENDER_MODE !== "export",
      deterministicCamera: RENDER_MODE === "export",
    });
  }
}
// end F-69

function addRouteEntities(viewer, playbackState, sampleTrack) {
  const Cesium = window.Cesium;
  const routePositions = buildRoutePositions(Cesium, playbackState);
  const routeBoundingSphere = Cesium.BoundingSphere.fromPoints(routePositions);
  const startPosition = routePositions[0];
  const endPosition = routePositions[routePositions.length - 1];
  playbackState.routePositions = routePositions;

  const {
    activePositions,
    afterPositions,
    beforePositions,
  } = getRangeRoutePositions(playbackState);

  const routeEntity = viewer.entities.add({
    id: "sample-route",
    name: "Selected route range",
    polyline: {
      positions: activePositions,
      width: 4, //2.5, xxx
      clampToGround: true,
      material: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.95),
    },
  });

  const beforeRangeEntity = viewer.entities.add({
    id: "sample-route-before-range",
    name: "Route before selected range",
    polyline: {
      positions: beforePositions,
      width: 3,
      clampToGround: true,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#86a9c7").withAlpha(0.9),
        dashLength: 18,
      }),
    },
    show: beforePositions.length >= 2,
  });

  const afterRangeEntity = viewer.entities.add({
    id: "sample-route-after-range",
    name: "Route after selected range",
    polyline: {
      positions: afterPositions,
      width: 3,
      clampToGround: true,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#86a9c7").withAlpha(0.9),
        dashLength: 18,
      }),
    },
    show: afterPositions.length >= 2,
  });

  const startEntity = viewer.entities.add({
    id: "route-start",
    name: "Route start",
    position: startPosition,
    point: {
      pixelSize: 13,
      color: Cesium.Color.fromCssColorString("#6dff8a"),
      outlineColor: Cesium.Color.fromCssColorString("#062032"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const endEntity = viewer.entities.add({
    id: "route-end",
    name: "Route end",
    position: endPosition,
    point: {
      pixelSize: 13,
      color: Cesium.Color.fromCssColorString("#ff8a5b"),
      outlineColor: Cesium.Color.fromCssColorString("#062032"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  playbackState.route.beforeRangeEntity = beforeRangeEntity;
  playbackState.route.afterRangeEntity = afterRangeEntity;
  playbackState.route.startEntity = startEntity;
  playbackState.route.endEntity = endEntity;

  return { routeBoundingSphere, routeEntity, routePositions };
}

function resetFollowCameraSmoothing(playbackState) {
  playbackState.camera.smoothedFocus = null;
  playbackState.camera.smoothedHeading = null;
}

function updateCameraUI(playbackState) {
  const isFollowMode = playbackState.camera.mode === "follow";

  setTextContent(
    "cameraModeStatus",
    isFollowMode ? "Follow camera" : "Overview camera",
  );
  setCameraModeButtonLabel(
    isFollowMode ? "Switch to overview" : "Switch to follow",
  );
}

function syncCameraSettingsControls(playbackState) {
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);

  playbackState.camera.settings = cameraSettings;

  setNumericInputValue("cameraFollowDistanceInput", cameraSettings.followDistanceMeters);
  setNumericInputValue(
    "cameraFollowAltitudeInput",
    cameraSettings.followAltitudeOffsetMeters,
  );
  setNumericInputValue("cameraFollowPitchInput", cameraSettings.followPitchDegrees);
  setNumericInputValue(
    "cameraLookAheadDistanceInput",
    cameraSettings.lookAheadDistanceMeters,
  );
  setNumericInputValue(
    "cameraLookAheadWindowInput",
    cameraSettings.lookAheadPointWindow,
  );
  setNumericInputValue(
    "cameraSmoothingStrengthInput",
    cameraSettings.smoothingStrength,
  );
  setNumericInputValue(
    "cameraOverviewPitchInput",
    cameraSettings.overviewPitchDegrees,
  );
  setNumericInputValue(
    "cameraOverviewRangeMultiplierInput",
    cameraSettings.overviewRangeMultiplier,
  );
}

function applyCameraSettingsChange(viewer, playbackState, nextPartialSettings = {}) {
  playbackState.camera.settings = normalizeCameraSettings({
    ...playbackState.camera.settings,
    ...nextPartialSettings,
  });
  resetFollowCameraSmoothing(playbackState);
  syncCameraSettingsControls(playbackState);
  syncPlaybackState(viewer, playbackState);
}

// F-69: build explicit terrain-aware positions so camera and route-following entities share the same grounded path.
function toRouteDisplayPosition(
  Cesium,
  trackpoint,
  displayHeight = ROUTE_DISPLAY_HEIGHT_METERS,
) {
  return Cesium.Cartesian3.fromDegrees(
    trackpoint.longitude,
    trackpoint.latitude,
    displayHeight,
  );
}
// end F-69

function setOverviewCamera(viewer, playbackState) {
  const Cesium = window.Cesium;
  const { routeBoundingSphere } = playbackState.camera;
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);

  if (!routeBoundingSphere) {
    return;
  }

  viewer.camera.viewBoundingSphere(
    routeBoundingSphere,
    new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-cameraSettings.overviewPitchDegrees),
      Math.max(
        routeBoundingSphere.radius * cameraSettings.overviewRangeMultiplier,
        1800,
      ),
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

function getLookAheadTrackIndex(playbackState, lookAheadPointCount) {
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);
  const safeLookAheadPointCount = Number.isFinite(lookAheadPointCount)
    ? lookAheadPointCount
    : cameraSettings.lookAheadPointWindow;

  return Math.min(
    playbackState.currentIndex + safeLookAheadPointCount,
    playbackState.trackpoints.length - 1,
  );
}

function getFollowCameraLookAheadTargets(Cesium, playbackState, currentPosition) {
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);
  const nearDistanceThreshold = Math.max(
    4,
    cameraSettings.lookAheadDistanceMeters * 0.45,
  );
  const farDistanceThreshold = cameraSettings.lookAheadDistanceMeters;
  const targets = {
    nearPosition: null,
    farPosition: null,
  };

  for (
    let trackpointIndex = playbackState.currentIndex + 1;
    trackpointIndex < playbackState.trackpoints.length;
    trackpointIndex += 1
  ) {
    const candidatePosition = playbackState.routePositions[trackpointIndex];

    if (!candidatePosition) {
      continue;
    }

    const candidateDistance = Cesium.Cartesian3.distance(
      currentPosition,
      candidatePosition,
    );

    if (!targets.nearPosition && candidateDistance >= nearDistanceThreshold) {
      targets.nearPosition = candidatePosition;
    }

    if (candidateDistance >= farDistanceThreshold) {
      targets.farPosition = candidatePosition;
      break;
    }
  }

  const fallbackPosition =
    playbackState.routePositions[getLookAheadTrackIndex(playbackState)] ||
    currentPosition;

  return {
    nearPosition: targets.nearPosition || fallbackPosition,
    farPosition: targets.farPosition || targets.nearPosition || fallbackPosition,
  };
}

function toLocalDirectionVector(
  Cesium,
  inverseTransform,
  fromPosition,
  targetPosition,
) {
  const worldDirection = Cesium.Cartesian3.subtract(
    targetPosition,
    fromPosition,
    new Cesium.Cartesian3(),
  );

  if (Cesium.Cartesian3.magnitudeSquared(worldDirection) < 9) {
    return null;
  }

  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
    inverseTransform,
    worldDirection,
    new Cesium.Cartesian3(),
  );

  if (
    !Number.isFinite(localDirection.x) ||
    !Number.isFinite(localDirection.y) ||
    localDirection.x * localDirection.x + localDirection.y * localDirection.y < 1
  ) {
    return null;
  }

  return localDirection;
}

function getLocalDirectionHeading(localDirection) {
  return Math.atan2(localDirection.x, localDirection.y);
}

function analyzeFollowCameraManeuver(
  Cesium,
  playbackState,
  currentPosition,
  inverseTransform,
) {
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);
  const lookAheadLimit = Math.min(
    playbackState.currentIndex + cameraSettings.lookAheadPointWindow,
    playbackState.routePositions.length - 1,
  );
  let previousHeading = null;
  let firstHeading = null;
  let finalHeading = null;
  let cumulativeHeadingDelta = 0;
  let largestHeadingDelta = 0;
  let turnReversalCount = 0;
  let alternatingTurnCount = 0;
  let previousSignedDelta = 0;
  let minLocalX = 0;
  let maxLocalX = 0;
  let minLocalY = 0;
  let maxLocalY = 0;

  for (
    let trackpointIndex = playbackState.currentIndex + 1;
    trackpointIndex <= lookAheadLimit;
    trackpointIndex += 1
  ) {
    const candidatePosition = playbackState.routePositions[trackpointIndex];

    if (!candidatePosition) {
      continue;
    }

    const localDirection = toLocalDirectionVector(
      Cesium,
      inverseTransform,
      trackpointIndex === playbackState.currentIndex + 1
        ? currentPosition
        : playbackState.routePositions[trackpointIndex - 1],
      candidatePosition,
    );

    if (!localDirection) {
      continue;
    }

    const heading = getLocalDirectionHeading(localDirection);
    const offsetFromCurrent = Cesium.Matrix4.multiplyByPointAsVector(
      inverseTransform,
      Cesium.Cartesian3.subtract(
        candidatePosition,
        currentPosition,
        new Cesium.Cartesian3(),
      ),
      new Cesium.Cartesian3(),
    );

    minLocalX = Math.min(minLocalX, offsetFromCurrent.x);
    maxLocalX = Math.max(maxLocalX, offsetFromCurrent.x);
    minLocalY = Math.min(minLocalY, offsetFromCurrent.y);
    maxLocalY = Math.max(maxLocalY, offsetFromCurrent.y);

    if (firstHeading === null) {
      firstHeading = heading;
    }

    if (previousHeading !== null) {
      const signedDelta = Cesium.Math.negativePiToPi(heading - previousHeading);
      const absoluteDelta = Math.abs(signedDelta);

      cumulativeHeadingDelta += absoluteDelta;
      largestHeadingDelta = Math.max(largestHeadingDelta, absoluteDelta);

      if (
        Math.abs(previousSignedDelta) > Cesium.Math.toRadians(10) &&
        Math.abs(signedDelta) > Cesium.Math.toRadians(10) &&
        Math.sign(previousSignedDelta) !== Math.sign(signedDelta)
      ) {
        turnReversalCount += 1;
      }

      if (absoluteDelta > Cesium.Math.toRadians(14)) {
        alternatingTurnCount += 1;
      }

      previousSignedDelta = signedDelta;
    }

    previousHeading = heading;
    finalHeading = heading;
  }

  const routeComplexity = Cesium.Math.clamp(
    cumulativeHeadingDelta / Cesium.Math.toRadians(165) +
      largestHeadingDelta / Cesium.Math.toRadians(80) * 0.45 +
      turnReversalCount * 0.42 +
      alternatingTurnCount * 0.08,
    0,
    1,
  );
  const lateralSpanMeters = maxLocalX - minLocalX;
  const forwardSpanMeters = Math.max(0, maxLocalY - minLocalY);
  const backwardTravelMeters = Math.max(0, -minLocalY);
  const netHeadingDelta =
    firstHeading === null || finalHeading === null
      ? 0
      : Math.abs(Cesium.Math.negativePiToPi(finalHeading - firstHeading));
  const shouldHoldHeading =
    routeComplexity > 0.3 &&
    lateralSpanMeters < 18 &&
    netHeadingDelta < Cesium.Math.toRadians(18) &&
    backwardTravelMeters < 8;

  return {
    backwardTravelMeters,
    exitHeading: finalHeading,
    forwardSpanMeters,
    lateralSpanMeters,
    routeComplexity,
    stabilityBias: Cesium.Math.clamp(
      routeComplexity * 0.65 +
        Cesium.Math.clamp(lateralSpanMeters / 55, 0, 1) * 0.2 +
        Cesium.Math.clamp(backwardTravelMeters / 70, 0, 1) * 0.4,
      0,
      1,
    ),
    shouldHoldHeading,
  };
}

function getStableFollowHeading(
  Cesium,
  playbackState,
  currentPosition,
  inverseTransform,
  maneuverAnalysis,
) {
  const { nearPosition, farPosition } = getFollowCameraLookAheadTargets(
    Cesium,
    playbackState,
    currentPosition,
  );
  const nearDirection = toLocalDirectionVector(
    Cesium,
    inverseTransform,
    currentPosition,
    nearPosition,
  );
  const farDirection = toLocalDirectionVector(
    Cesium,
    inverseTransform,
    currentPosition,
    farPosition,
  );

  if (!nearDirection && !farDirection) {
    return playbackState.camera.smoothedHeading;
  }

  const blendedDirection = new Cesium.Cartesian3(0, 0, 0);
  const adaptiveStrength = Cesium.Math.clamp(
    playbackState.camera.adaptiveStrength ?? EXPORT_OPTIONS.defaults.adaptiveStrength,
    EXPORT_SETTINGS_FIELDS.adaptiveStrength.min,
    EXPORT_SETTINGS_FIELDS.adaptiveStrength.max,
  );
  const stabilityBias = Cesium.Math.clamp(
    (maneuverAnalysis?.stabilityBias ?? 0) * (0.55 + adaptiveStrength * 0.25),
    0,
    1,
  );
  const nearWeight = maneuverAnalysis?.shouldHoldHeading
    ? 0.08
    : Cesium.Math.lerp(0.72, 0.2, stabilityBias);
  const farWeight = 1 - nearWeight;

  if (nearDirection) {
    const normalizedNearDirection = Cesium.Cartesian3.normalize(
      nearDirection,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(
      blendedDirection,
      Cesium.Cartesian3.multiplyByScalar(
        normalizedNearDirection,
        nearWeight,
        new Cesium.Cartesian3(),
      ),
      blendedDirection,
    );
  }

  if (farDirection) {
    const normalizedFarDirection = Cesium.Cartesian3.normalize(
      farDirection,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(
      blendedDirection,
      Cesium.Cartesian3.multiplyByScalar(
        normalizedFarDirection,
        farWeight,
        new Cesium.Cartesian3(),
      ),
      blendedDirection,
    );
  }

  if (
    !Number.isFinite(blendedDirection.x) ||
    !Number.isFinite(blendedDirection.y) ||
    Cesium.Cartesian3.magnitudeSquared(blendedDirection) === 0
  ) {
    return playbackState.camera.smoothedHeading;
  }

  return getLocalDirectionHeading(blendedDirection);
}

function updateSmoothedFollowCameraState(
  Cesium,
  playbackState,
  desiredFocus,
  desiredHeading,
  useSmoothing,
  maneuverAnalysis,
) {
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);

  if (!useSmoothing || !playbackState.camera.smoothedFocus) {
    playbackState.camera.smoothedFocus = Cesium.Cartesian3.clone(desiredFocus);
    playbackState.camera.smoothedHeading = desiredHeading;
    return;
  }

  const safeDesiredHeading = Number.isFinite(desiredHeading)
    ? desiredHeading
    : playbackState.camera.smoothedHeading;

  if (!Number.isFinite(safeDesiredHeading)) {
    return;
  }

  const headingDelta = Cesium.Math.negativePiToPi(
    safeDesiredHeading - playbackState.camera.smoothedHeading,
  );
  const absoluteHeadingDelta = Math.abs(headingDelta);

  if (absoluteHeadingDelta > Cesium.Math.toRadians(120)) {
    playbackState.camera.smoothedFocus = Cesium.Cartesian3.clone(desiredFocus);
    playbackState.camera.smoothedHeading = safeDesiredHeading;
    return;
  }

  const turnSharpness = Cesium.Math.clamp(
    absoluteHeadingDelta / Cesium.Math.toRadians(60),
    0,
    1,
  );
  const stabilityBias = maneuverAnalysis?.stabilityBias ?? 0;
  const smoothingStrength = Cesium.Math.clamp(
    cameraSettings.smoothingStrength,
    0.25,
    3,
  );
  const focusResponsiveness =
    Cesium.Math.lerp(0.24, 0.1, stabilityBias) / smoothingStrength;
  const headingResponsiveness =
    Cesium.Math.lerp(0.28, 0.08, stabilityBias) / smoothingStrength;

  Cesium.Cartesian3.lerp(
    playbackState.camera.smoothedFocus,
    desiredFocus,
    Cesium.Math.lerp(focusResponsiveness * 0.8, focusResponsiveness, turnSharpness),
    playbackState.camera.smoothedFocus,
  );

  if (absoluteHeadingDelta < Cesium.Math.toRadians(1.25)) {
    return;
  }

  playbackState.camera.smoothedHeading = Cesium.Math.negativePiToPi(
    playbackState.camera.smoothedHeading +
      headingDelta *
        Cesium.Math.lerp(
          headingResponsiveness * 0.7,
          headingResponsiveness,
          turnSharpness,
        ),
  );
}

function updateFollowCamera(viewer, playbackState, options = {}) {
  const Cesium = window.Cesium;
  const useSmoothing = options.useSmoothing ?? true;
  const cameraSettings = normalizeCameraSettings(playbackState.camera.settings);

  if (playbackState.camera.mode !== "follow") {
    return;
  }

  const currentPosition = playbackState.currentSamplePosition;

  if (!currentPosition) {
    return;
  }
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const up = ellipsoid.geodeticSurfaceNormal(
    currentPosition,
    new Cesium.Cartesian3(),
  );
  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(currentPosition);
  const inverseTransform = Cesium.Matrix4.inverseTransformation(
    transform,
    new Cesium.Matrix4(),
  );
  const maneuverAnalysis = analyzeFollowCameraManeuver(
    Cesium,
    playbackState,
    currentPosition,
    inverseTransform,
  );
  const adaptiveStrength = Cesium.Math.clamp(
    playbackState.camera.adaptiveStrength ?? EXPORT_OPTIONS.defaults.adaptiveStrength,
    EXPORT_SETTINGS_FIELDS.adaptiveStrength.min,
    EXPORT_SETTINGS_FIELDS.adaptiveStrength.max,
  );
  const routeComplexity = Cesium.Math.clamp(
    maneuverAnalysis.routeComplexity * (0.55 + adaptiveStrength * 0.2) +
      maneuverAnalysis.stabilityBias * 0.35,
    0,
    1,
  );
  const elevatedComplexity = Cesium.Math.clamp(
    routeComplexity +
      Cesium.Math.clamp(maneuverAnalysis.lateralSpanMeters / 70, 0, 1) * 0.25 +
      Cesium.Math.clamp(maneuverAnalysis.backwardTravelMeters / 90, 0, 1) * 0.4,
    0,
    1,
  );
  const desiredFocus = Cesium.Cartesian3.add(
    currentPosition,
    Cesium.Cartesian3.multiplyByScalar(
      up,
      cameraSettings.followAltitudeOffsetMeters,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  let desiredHeading = getStableFollowHeading(
    Cesium,
    playbackState,
    currentPosition,
    inverseTransform,
    maneuverAnalysis,
  );

  if (
    Number.isFinite(desiredHeading) &&
    Number.isFinite(playbackState.camera.smoothedHeading)
  ) {
    const desiredHeadingDelta = Cesium.Math.negativePiToPi(
      desiredHeading - playbackState.camera.smoothedHeading,
    );
    desiredHeading = Cesium.Math.negativePiToPi(
      playbackState.camera.smoothedHeading +
        desiredHeadingDelta *
          Cesium.Math.lerp(
            1,
            maneuverAnalysis.shouldHoldHeading ? 0.12 : 0.28,
            routeComplexity,
          ),
    );
  }

  if (
    maneuverAnalysis.shouldHoldHeading &&
    Number.isFinite(maneuverAnalysis.exitHeading)
  ) {
    desiredHeading = maneuverAnalysis.exitHeading;
  }

  updateSmoothedFollowCameraState(
    Cesium,
    playbackState,
    desiredFocus,
    desiredHeading,
    useSmoothing,
    maneuverAnalysis,
  );

  if (
    !playbackState.camera.smoothedFocus ||
    !Number.isFinite(playbackState.camera.smoothedHeading)
  ) {
    return;
  }

  const heading = playbackState.camera.smoothedHeading;
  const pitch = Cesium.Math.toRadians(-cameraSettings.followPitchDegrees);
  const range = cameraSettings.followDistanceMeters;
  const localOffset = new Cesium.Cartesian3(
    -Math.sin(heading) * Math.cos(pitch) * range,
    -Math.cos(heading) * Math.cos(pitch) * range,
    -Math.sin(pitch) * range,
  );
  const destination = Cesium.Matrix4.multiplyByPoint(
    Cesium.Transforms.eastNorthUpToFixedFrame(playbackState.camera.smoothedFocus),
    localOffset,
    new Cesium.Cartesian3(),
  );
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(
      playbackState.camera.smoothedFocus,
      destination,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const cameraUp = ellipsoid.geodeticSurfaceNormal(
    destination,
    new Cesium.Cartesian3(),
  );

  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  viewer.camera.setView({
    destination,
    orientation: {
      direction,
      up: cameraUp,
    },
  });
}

// F-69: load terrain with a graceful fallback so preview/export can use real relief without breaking offline startup.
async function loadTerrainProvider(Cesium) {
  try {
    const terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
      DEFAULT_TERRAIN_PROVIDER_URL,
    );

    return {
      error: null,
      provider: terrainProvider,
      providerLabel: DEFAULT_TERRAIN_PROVIDER_LABEL,
    };
  } catch (error) {
    console.error("3D terrain failed to load:", error);

    return {
      error: error instanceof Error ? error : new Error(String(error)),
      provider: null,
      providerLabel: "Flat terrain fallback",
    };
  }
}

async function ensureTerrainProvider(viewer, playbackState) {
  const Cesium = window.Cesium;

  if (playbackState.terrain.provider || playbackState.terrain.providerError) {
    return;
  }

  const terrainState = await loadTerrainProvider(Cesium);
  playbackState.terrain.provider = terrainState.provider;
  playbackState.terrain.providerError = terrainState.error;
  playbackState.terrain.providerLabel = terrainState.providerLabel;
  playbackState.terrain.providerReady = Boolean(terrainState.provider) && !terrainState.error;
}

function applyTerrainSceneSettings(viewer, playbackState) {
  const terrainSettings = normalizeTerrainSettings(playbackState.terrain.settings);

  viewer.terrainProvider =
    terrainSettings.enabled && playbackState.terrain.providerReady
      ? playbackState.terrain.provider
      : playbackState.terrain.flatProvider;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.verticalExaggeration = terrainSettings.enabled
    ? terrainSettings.exaggeration
    : 1;
  viewer.scene.verticalExaggerationRelativeHeight = 0;
  viewer.scene.requestRender();
}

async function initializeViewerTerrain(viewer, playbackState) {
  playbackState.terrain.flatProvider = viewer.terrainProvider;
  await ensureTerrainProvider(viewer, playbackState);
  applyTerrainSceneSettings(viewer, playbackState);
  syncTerrainSettingsControls(playbackState);

  try {
    await refreshTerrainRouteGeometry(viewer, playbackState, {
      resampleHeights: true,
      updateTimelineState: false,
    });
  } catch (error) {
    console.error("Terrain sampling failed:", error);
    playbackState.terrain.sampledHeights = playbackState.trackpoints.map(() => 0);
    playbackState.terrain.providerError = error instanceof Error ? error : new Error(String(error));
    playbackState.terrain.providerReady = false;
    setTerrainStatus("3D terrain unavailable; using flat terrain fallback.");
  }
}

async function applyTerrainSettingsChange(viewer, playbackState, nextPartialSettings = {}) {
  playbackState.terrain.settings = normalizeTerrainSettings({
    ...playbackState.terrain.settings,
    ...nextPartialSettings,
  });
  try {
    await ensureTerrainProvider(viewer, playbackState);
    applyTerrainSceneSettings(viewer, playbackState);
    await refreshTerrainRouteGeometry(viewer, playbackState, {
      updateTimelineState: true,
    });
    syncMediaPreviewEntities(viewer, playbackState);
  } catch (error) {
    console.error("Applying terrain settings failed:", error);
    setTerrainStatus("3D terrain refresh failed.");
  }
  syncTerrainSettingsControls(playbackState);
}
// end F-69

function createViewer(renderMode) {
  const Cesium = window.Cesium;

  if (!Cesium) {
    throw new Error("Cesium failed to load in the renderer.");
  }

  const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    baseLayer: createBaseLayer(Cesium),
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.screenSpaceCameraController.inertiaSpin = 0;
  viewer.scene.screenSpaceCameraController.inertiaTranslate = 0;
  viewer.scene.screenSpaceCameraController.inertiaZoom = 0;

  if (renderMode === "export") {
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
  }

  return viewer;
}

function advancePlaybackIndex(playbackState) {
  const { trackpoints } = playbackState;

  while (
    playbackState.currentIndex < trackpoints.length - 2 &&
    trackpoints[playbackState.currentIndex + 1].timestamp <=
      playbackState.currentTimestamp
  ) {
    playbackState.currentIndex += 1;
  }

  while (
    playbackState.currentIndex > 0 &&
    trackpoints[playbackState.currentIndex].timestamp >
      playbackState.currentTimestamp
  ) {
    playbackState.currentIndex -= 1;
  }
}

function interpolateTrackpoint(playbackState) {
  const Cesium = window.Cesium;
  const { currentIndex, currentTimestamp, trackpoints } = playbackState;
  const startTrackpoint = trackpoints[currentIndex];
  const endTrackpoint =
    trackpoints[Math.min(currentIndex + 1, trackpoints.length - 1)];

  if (startTrackpoint.timestamp === endTrackpoint.timestamp) {
    playbackState.currentSample = {
      ...startTrackpoint,
      timestamp: currentTimestamp,
    };
    playbackState.currentSamplePosition =
      playbackState.routePositions[currentIndex] ||
      toRouteDisplayPosition(
        Cesium,
        startTrackpoint,
        getTerrainDisplayHeight(playbackState, currentIndex),
      );
    return;
  }

  const segmentRatio = Math.min(
    1,
    Math.max(
      0,
      (currentTimestamp - startTrackpoint.timestamp) /
        (endTrackpoint.timestamp - startTrackpoint.timestamp),
    ),
  );

  playbackState.currentSample = {
    time: new Date(currentTimestamp).toISOString(),
    timestamp: currentTimestamp,
    latitude:
      startTrackpoint.latitude +
      (endTrackpoint.latitude - startTrackpoint.latitude) * segmentRatio,
    longitude:
      startTrackpoint.longitude +
      (endTrackpoint.longitude - startTrackpoint.longitude) * segmentRatio,
    altitude:
      startTrackpoint.altitude +
      (endTrackpoint.altitude - startTrackpoint.altitude) * segmentRatio,
    distance:
      startTrackpoint.distance === null || endTrackpoint.distance === null
        ? null
        : startTrackpoint.distance +
          (endTrackpoint.distance - startTrackpoint.distance) * segmentRatio,
    heartRate:
      startTrackpoint.heartRate === null || endTrackpoint.heartRate === null
        ? startTrackpoint.heartRate ?? endTrackpoint.heartRate ?? null
        : startTrackpoint.heartRate +
          (endTrackpoint.heartRate - startTrackpoint.heartRate) * segmentRatio,
    cadence:
      startTrackpoint.cadence === null || endTrackpoint.cadence === null
        ? startTrackpoint.cadence ?? endTrackpoint.cadence ?? null
        : startTrackpoint.cadence +
          (endTrackpoint.cadence - startTrackpoint.cadence) * segmentRatio,
    temperature:
      startTrackpoint.temperature === null || endTrackpoint.temperature === null
        ? startTrackpoint.temperature ?? endTrackpoint.temperature ?? null
        : startTrackpoint.temperature +
          (endTrackpoint.temperature - startTrackpoint.temperature) * segmentRatio,
    speed:
      startTrackpoint.speed === null || endTrackpoint.speed === null
        ? null
        : startTrackpoint.speed +
          (endTrackpoint.speed - startTrackpoint.speed) * segmentRatio,
  };
  // F-69: interpolate along the terrain-backed route height so the active marker and camera stay above exaggerated terrain.
  const startDisplayHeight = getTerrainDisplayHeight(playbackState, currentIndex);
  const endDisplayHeight = getTerrainDisplayHeight(
    playbackState,
    Math.min(currentIndex + 1, trackpoints.length - 1),
  );
  const interpolatedDisplayHeight =
    startDisplayHeight + (endDisplayHeight - startDisplayHeight) * segmentRatio;

  playbackState.currentSamplePosition = toRouteDisplayPosition(
    Cesium,
    playbackState.currentSample,
    interpolatedDisplayHeight,
  );
  // end F-69
}

function getRouteDisplayPositionAtTimestamp(Cesium, playbackState, timestamp) {
  const clampedTimestamp = Math.min(
    playbackState.fullEndTimestamp,
    Math.max(playbackState.fullStartTimestamp, timestamp),
  );
  const { trackpoints } = playbackState;
  const currentIndex = getTrackpointIndexAtOrBefore(trackpoints, clampedTimestamp);
  const startTrackpoint = trackpoints[currentIndex];
  const endTrackpoint = trackpoints[Math.min(currentIndex + 1, trackpoints.length - 1)];

  if (
    currentIndex >= trackpoints.length - 1 ||
    startTrackpoint.timestamp === endTrackpoint.timestamp
  ) {
    return (
      playbackState.routePositions[currentIndex] ||
      toRouteDisplayPosition(
        Cesium,
        startTrackpoint,
        getTerrainDisplayHeight(playbackState, currentIndex),
      )
    );
  }

  const segmentRatio = Math.min(
    1,
    Math.max(
      0,
      (clampedTimestamp - startTrackpoint.timestamp) /
        (endTrackpoint.timestamp - startTrackpoint.timestamp),
    ),
  );
  const interpolatedSample = {
    latitude:
      startTrackpoint.latitude +
      (endTrackpoint.latitude - startTrackpoint.latitude) * segmentRatio,
    longitude:
      startTrackpoint.longitude +
      (endTrackpoint.longitude - startTrackpoint.longitude) * segmentRatio,
  };
  const startDisplayHeight = getTerrainDisplayHeight(playbackState, currentIndex);
  const endDisplayHeight = getTerrainDisplayHeight(
    playbackState,
    Math.min(currentIndex + 1, trackpoints.length - 1),
  );

  return toRouteDisplayPosition(
    Cesium,
    interpolatedSample,
    startDisplayHeight + (endDisplayHeight - startDisplayHeight) * segmentRatio,
  );
}

function getRangeRoutePositions(playbackState) {
  const Cesium = window.Cesium;
  const beforePositions = [];
  const activePositions = [];
  const afterPositions = [];
  const { routePositions, trackpoints } = playbackState;
  const rangeStartIndex = getTrackpointIndexAtOrBefore(
    trackpoints,
    playbackState.startTimestamp,
  );
  const rangeEndIndex = getTrackpointIndexAtOrBefore(
    trackpoints,
    playbackState.endTimestamp,
  );
  const rangeStartPosition = getRouteDisplayPositionAtTimestamp(
    Cesium,
    playbackState,
    playbackState.startTimestamp,
  );
  const rangeEndPosition = getRouteDisplayPositionAtTimestamp(
    Cesium,
    playbackState,
    playbackState.endTimestamp,
  );

  if (playbackState.startTimestamp > playbackState.fullStartTimestamp) {
    for (let index = 0; index <= rangeStartIndex; index += 1) {
      appendUniqueRoutePosition(Cesium, beforePositions, routePositions[index]);
    }
    appendUniqueRoutePosition(Cesium, beforePositions, rangeStartPosition);
  }

  appendUniqueRoutePosition(Cesium, activePositions, rangeStartPosition);
  for (let index = rangeStartIndex + 1; index <= rangeEndIndex; index += 1) {
    appendUniqueRoutePosition(Cesium, activePositions, routePositions[index]);
  }
  appendUniqueRoutePosition(Cesium, activePositions, rangeEndPosition);

  if (playbackState.endTimestamp < playbackState.fullEndTimestamp) {
    appendUniqueRoutePosition(Cesium, afterPositions, rangeEndPosition);
    for (
      let index = Math.min(rangeEndIndex + 1, routePositions.length - 1);
      index < routePositions.length;
      index += 1
    ) {
      appendUniqueRoutePosition(Cesium, afterPositions, routePositions[index]);
    }
  }

  return {
    activePositions,
    afterPositions,
    beforePositions,
    rangeStartPosition,
  };
}

function syncRouteRangeEntities(playbackState) {
  const { activePositions, afterPositions, beforePositions } =
    getRangeRoutePositions(playbackState);

  if (playbackState.camera.routeEntity?.polyline) {
    playbackState.camera.routeEntity.polyline.positions = activePositions;
    playbackState.camera.routeEntity.show = activePositions.length >= 2;
  }

  if (playbackState.route.beforeRangeEntity?.polyline) {
    playbackState.route.beforeRangeEntity.polyline.positions = beforePositions;
    playbackState.route.beforeRangeEntity.show = beforePositions.length >= 2;
  }

  if (playbackState.route.afterRangeEntity?.polyline) {
    playbackState.route.afterRangeEntity.polyline.positions = afterPositions;
    playbackState.route.afterRangeEntity.show = afterPositions.length >= 2;
  }

  return activePositions;
}

function buildPlayedRoutePositions(Cesium, playbackState) {
  const playedPositions = playbackState.playedRoutePositionsScratch;
  playedPositions.length = 0;
  const rangeStartIndex = getTrackpointIndexAtOrBefore(
    playbackState.trackpoints,
    playbackState.startTimestamp,
  );
  const rangeStartPosition = getRouteDisplayPositionAtTimestamp(
    Cesium,
    playbackState,
    playbackState.startTimestamp,
  );

  appendUniqueRoutePosition(Cesium, playedPositions, rangeStartPosition);

  for (
    let index = rangeStartIndex + 1;
    index <= playbackState.currentIndex;
    index += 1
  ) {
    appendUniqueRoutePosition(
      Cesium,
      playedPositions,
      playbackState.routePositions[index],
    );
  }

  if (
    playbackState.currentSamplePosition &&
    playbackState.currentSamplePosition !==
      playbackState.routePositions[playbackState.currentIndex]
  ) {
    appendUniqueRoutePosition(
      Cesium,
      playedPositions,
      playbackState.currentSamplePosition,
    );
  }

  return playedPositions;
}

function addPlaybackEntities(viewer, playbackState) {
  const Cesium = window.Cesium;

  const markerEntity = viewer.entities.add({
    id: "current-position-marker",
    name: "Current position",
    position: playbackState.currentSamplePosition,
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString("#ffe56a"),
      outlineColor: Cesium.Color.fromCssColorString("#062032"),
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  const progressEntity = viewer.entities.add({
    id: "played-route",
    name: "Played route",
    polyline: {
      positions: new Cesium.CallbackProperty(() => {
        return buildPlayedRoutePositions(Cesium, playbackState);
      }, false),
      width: 40, // width of completed route
      clampToGround: true,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString("#2c7dff"),
        glowPower: 0.16,
      }),
    },
  });

  playbackState.markerEntity = markerEntity;
  playbackState.progressEntity = progressEntity;
}

function updateMarkerPosition(playbackState) {
  if (playbackState.markerEntity && playbackState.currentSamplePosition) {
    playbackState.markerEntity.position = playbackState.currentSamplePosition;
  }
}

function updatePlaybackUI(playbackState) {
  const elapsedMs = playbackState.currentTimestamp - playbackState.startTimestamp;
  const progressRatio = getPlaybackProgressRatio(playbackState);
  const timelineSlider = document.getElementById("timelineSlider");
  const timelineRangeStartSlider = document.getElementById(
    "timelineRangeStartSlider",
  );
  const timelineRangeEndSlider = document.getElementById("timelineRangeEndSlider");
  const isFullRangeSelected =
    playbackState.startTimestamp === playbackState.fullStartTimestamp &&
    playbackState.endTimestamp === playbackState.fullEndTimestamp;

  setTextContent("playbackStatus", playbackState.isPlaying ? "Playing" : "Paused");
  setTextContent("playbackProgress", formatProgress(progressRatio));
  setTextContent("playbackElapsed", formatDuration(elapsedMs));
  setTextContent("playbackDuration", formatDuration(playbackState.durationMs));
  setTextContent(
    "playbackCurrentTime",
    formatTimestamp(playbackState.currentSample.time),
  );
  setTextContent(
    "playbackDistance",
    formatDistance(playbackState.currentSample.distance),
  );
  setTextContent("playbackSpeed", `${playbackState.speedMultiplier}x track time`);
  setTextContent("timelineElapsed", formatDuration(elapsedMs));
  setTextContent("timelineDuration", formatDuration(playbackState.durationMs));
  setTextContent(
    "timelineRangeStartValue",
    formatDuration(playbackState.startTimestamp - playbackState.fullStartTimestamp),
  );
  setTextContent(
    "timelineRangeEndValue",
    formatDuration(playbackState.endTimestamp - playbackState.fullStartTimestamp),
  );
  setTextContent(
    "timelineRangeStatus",
    isFullRangeSelected ? "Full activity" : "Selected range",
  );
  setPlaybackButtonLabel(playbackState.isPlaying ? "Pause" : "Play");

  if (
    timelineSlider instanceof HTMLInputElement &&
    !playbackState.ui.isTimelineInteracting
  ) {
    timelineSlider.value = timestampToSliderValue(
      playbackState,
      playbackState.currentTimestamp,
    );
  }

  if (timelineRangeStartSlider instanceof HTMLInputElement) {
    timelineRangeStartSlider.value = fullTimestampToSliderValue(
      playbackState,
      playbackState.startTimestamp,
    );
  }

  if (timelineRangeEndSlider instanceof HTMLInputElement) {
    timelineRangeEndSlider.value = fullTimestampToSliderValue(
      playbackState,
      playbackState.endTimestamp,
    );
  }
}

function updateMetricOverlay(playbackState) {
  const speedGaugeDial = document.getElementById("metricOverlaySpeedGaugeDial");
  const heartRateGaugeCard = document.getElementById("metricOverlayHeartRateGaugeCard");
  const heartRateGaugeFill = document.getElementById("metricOverlayHeartRateGaugeFill");
  const elapsedMs = playbackState.currentTimestamp - playbackState.startTimestamp;
  const speedMetersPerSecond = playbackState.currentSample.speed;
  const heartRate = playbackState.currentSample.heartRate;
  const cadence = playbackState.currentSample.cadence;
  const temperature = playbackState.currentSample.temperature;
  const heartRateGaugeState = getHeartRateGaugeState(heartRate);
  const speedKph = Number.isFinite(speedMetersPerSecond)
    ? speedMetersPerSecond * 3.6
    : Number.NaN;
  const speedGaugeMaxKph = normalizeSpeedGaugeMaxKph(playbackState.ui.speedGaugeMaxKph);
  const speedGaugePeakKph = updateSpeedometerPeak(playbackState, speedKph);
  const speedGaugeRatio =
    Number.isFinite(speedKph) && speedGaugeMaxKph > 0
      ? Math.min(1, Math.max(0, speedKph / speedGaugeMaxKph))
      : 0;
  const speedGaugePeakRatio =
    Number.isFinite(speedGaugePeakKph) && speedGaugeMaxKph > 0
      ? Math.min(1, Math.max(0, speedGaugePeakKph / speedGaugeMaxKph))
      : 0;
  const speedometerSweepDegrees = 240;
  const speedometerRotationDegrees = -120 + speedGaugeRatio * speedometerSweepDegrees;
  const speedometerProgressDegrees = speedGaugePeakRatio * speedometerSweepDegrees;

  setTextContent("metricOverlayTime", formatDuration(elapsedMs));
  setTextContent(
    "metricOverlayDistance",
    formatDistance(playbackState.currentSample.distance),
  );
  setTextContent(
    "metricOverlayAltitude",
    formatAltitudeValue(playbackState.currentSample.altitude),
  );
  setTextContent("metricOverlayCadence", formatCadenceValue(cadence));
  setTextContent("metricOverlayTemperature", formatTemperatureValue(temperature));
  setTextContent("metricOverlaySpeed", formatOverlaySpeed(speedMetersPerSecond));
  // F-74: keep the text speed element value in sync so switching modes shows current speed immediately
  setTextContent("metricOverlaySpeedTextValue", formatOverlaySpeed(speedMetersPerSecond));
  // end F-74
  if (speedGaugeDial instanceof HTMLElement) {
    speedGaugeDial.style.setProperty(
      "--speedometer-progress",
      `${speedometerProgressDegrees}deg`,
    );
    speedGaugeDial.style.setProperty(
      "--speedometer-rotation",
      `${speedometerRotationDegrees}deg`,
    );
  }

  if (heartRateGaugeFill instanceof HTMLElement) {
    heartRateGaugeFill.classList.remove(
      "metric-gauge__fill--heart-green",
      "metric-gauge__fill--heart-yellow",
      "metric-gauge__fill--heart-orange",
      "metric-gauge__fill--heart-red",
    );
    heartRateGaugeFill.classList.add(heartRateGaugeState.fillClass);
    heartRateGaugeFill.style.width = `${Math.round(heartRateGaugeState.ratio * 100)}%`;
  }

  if (heartRateGaugeCard instanceof HTMLElement) {
    heartRateGaugeCard.dataset.available = Number.isFinite(heartRate) ? "true" : "false";
  }

  setTextContent("metricOverlayHeartRate", formatHeartRate(heartRate));
  applyOverlayVisibility(playbackState);
}

function syncPlaybackState(viewer, playbackState, options = {}) {
  advancePlaybackIndex(playbackState);
  interpolateTrackpoint(playbackState);
  updateMarkerPosition(playbackState);

  if (playbackState.camera.mode === "follow") {
    updateFollowCamera(viewer, playbackState, {
      useSmoothing: !(options.deterministicCamera ?? false),
    });
  } else {
    setOverviewCamera(viewer, playbackState);
  }

  if (options.updateUi !== false) {
    updatePlaybackUI(playbackState);
    updateCameraUI(playbackState);
  }

  if (options.updateMetricOverlay !== false) {
    updateMetricOverlay(playbackState);
  }

  if (options.updateMediaPreview !== false) {
    void updateMediaPreviewOverlay(playbackState);
  }
}

function setPlaybackTimestamp(viewer, playbackState, timestamp, options = {}) {
  playbackState.currentTimestamp = Math.min(
    playbackState.endTimestamp,
    Math.max(playbackState.startTimestamp, timestamp),
  );

  syncPlaybackState(viewer, playbackState, options);
}

function setPlaybackRange(
  viewer,
  playbackState,
  nextStartTimestamp,
  nextEndTimestamp,
  options = {},
) {
  const clampedStartTimestamp = Math.min(
    playbackState.fullEndTimestamp,
    Math.max(playbackState.fullStartTimestamp, nextStartTimestamp),
  );
  const clampedEndTimestamp = Math.min(
    playbackState.fullEndTimestamp,
    Math.max(clampedStartTimestamp, nextEndTimestamp),
  );

  playbackState.startTimestamp = clampedStartTimestamp;
  playbackState.endTimestamp = clampedEndTimestamp;
  playbackState.durationMs = clampedEndTimestamp - clampedStartTimestamp;
  playbackState.currentTimestamp = Math.min(
    playbackState.endTimestamp,
    Math.max(playbackState.startTimestamp, playbackState.currentTimestamp),
  );
  playbackState.lastFrameTime = null;
  resetFollowCameraSmoothing(playbackState);
  syncRouteRangeEntities(playbackState);
  syncPlaybackState(viewer, playbackState, options);
}

function stopPlayback(playbackState) {
  if (playbackState.animationFrameId !== null) {
    window.cancelAnimationFrame(playbackState.animationFrameId);
    playbackState.animationFrameId = null;
  }
}

function freezeFollowCamera(viewer, playbackState) {
  const Cesium = window.Cesium;

  if (playbackState.camera.mode !== "follow") {
    viewer.camera.cancelFlight();
    return;
  }

  const frozenPosition = Cesium.Cartesian3.clone(viewer.camera.positionWC);
  const frozenDirection = Cesium.Cartesian3.clone(viewer.camera.directionWC);
  const frozenUp = Cesium.Cartesian3.clone(viewer.camera.upWC);

  viewer.camera.cancelFlight();
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  viewer.camera.setView({
    destination: frozenPosition,
    orientation: {
      direction: frozenDirection,
      up: frozenUp,
    },
  });
}

function tickPlayback(viewer, playbackState, frameTime) {
  if (!playbackState.isPlaying) {
    playbackState.animationFrameId = null;
    return;
  }

  if (playbackState.lastFrameTime === null) {
    playbackState.lastFrameTime = frameTime;
  }

  const deltaMs = frameTime - playbackState.lastFrameTime;
  playbackState.lastFrameTime = frameTime;
  setPlaybackTimestamp(
    viewer,
    playbackState,
    playbackState.currentTimestamp + deltaMs * playbackState.speedMultiplier,
  );

  if (playbackState.currentTimestamp >= playbackState.endTimestamp) {
    playbackState.isPlaying = false;
    playbackState.lastFrameTime = null;
    updatePlaybackUI(playbackState);
    playbackState.animationFrameId = null;
    return;
  }

  playbackState.animationFrameId = window.requestAnimationFrame((nextFrameTime) =>
    tickPlayback(viewer, playbackState, nextFrameTime),
  );
}

function startPlayback(viewer, playbackState) {
  if (playbackState.isPlaying && playbackState.animationFrameId !== null) {
    return;
  }

  if (playbackState.currentTimestamp >= playbackState.endTimestamp) {
    setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp);
  }

  playbackState.isPlaying = true;
  playbackState.lastFrameTime = null;
  updatePlaybackUI(playbackState);
  playbackState.animationFrameId = window.requestAnimationFrame((frameTime) =>
    tickPlayback(viewer, playbackState, frameTime),
  );
}

function pausePlayback(viewer, playbackState) {
  playbackState.isPlaying = false;
  playbackState.lastFrameTime = null;
  stopPlayback(playbackState);
  freezeFollowCamera(viewer, playbackState);
  updatePlaybackUI(playbackState);
}

function restartPlayback(viewer, playbackState) {
  playbackState.lastFrameTime = null;
  resetFollowCameraSmoothing(playbackState);
  setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp);
  startPlayback(viewer, playbackState);
}

function beginTimelineInteraction(viewer, playbackState) {
  if (playbackState.ui.isTimelineInteracting) {
    return;
  }

  playbackState.ui.isTimelineInteracting = true;
  playbackState.ui.resumePlaybackAfterTimelineInteraction = playbackState.isPlaying;

  if (playbackState.isPlaying) {
    pausePlayback(viewer, playbackState);
  }
}

function seekPlaybackFromTimeline(viewer, playbackState, sliderValue) {
  resetFollowCameraSmoothing(playbackState);
  setPlaybackTimestamp(
    viewer,
    playbackState,
    sliderValueToTimestamp(playbackState, sliderValue),
  );
}

function endTimelineInteraction(viewer, playbackState) {
  if (!playbackState.ui.isTimelineInteracting) {
    return;
  }

  const shouldResume = playbackState.ui.resumePlaybackAfterTimelineInteraction;

  playbackState.ui.isTimelineInteracting = false;
  playbackState.ui.resumePlaybackAfterTimelineInteraction = false;
  updatePlaybackUI(playbackState);

  if (shouldResume) {
    startPlayback(viewer, playbackState);
  }
}

function switchCameraMode(viewer, playbackState) {
  playbackState.camera.mode =
    playbackState.camera.mode === "follow" ? "overview" : "follow";
  resetFollowCameraSmoothing(playbackState);
  syncPlaybackState(viewer, playbackState);
}

function setupPlaybackControls(viewer, playbackState) {
  const playPauseButton = document.getElementById("playPauseButton");
  const restartButton = document.getElementById("restartButton");
  const cameraModeButton = document.getElementById("cameraModeButton");
  const timelineSlider = document.getElementById("timelineSlider");
  const timelineRangeStartSlider = document.getElementById(
    "timelineRangeStartSlider",
  );
  const timelineRangeEndSlider = document.getElementById("timelineRangeEndSlider");
  const resetTimelineRangeButton = document.getElementById(
    "resetTimelineRangeButton",
  );

  playPauseButton?.addEventListener("click", () => {
    if (playbackState.isPlaying) {
      pausePlayback(viewer, playbackState);
      return;
    }

    startPlayback(viewer, playbackState);
  });

  restartButton?.addEventListener("click", () => {
    restartPlayback(viewer, playbackState);
  });

  cameraModeButton?.addEventListener("click", () => {
    switchCameraMode(viewer, playbackState);
  });

  if (timelineSlider instanceof HTMLInputElement) {
    timelineSlider.addEventListener("pointerdown", () => {
      beginTimelineInteraction(viewer, playbackState);
    });

    timelineSlider.addEventListener("pointerup", () => {
      endTimelineInteraction(viewer, playbackState);
    });

    timelineSlider.addEventListener("keydown", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        beginTimelineInteraction(viewer, playbackState);
      }
    });

    timelineSlider.addEventListener("keyup", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        endTimelineInteraction(viewer, playbackState);
      }
    });

    timelineSlider.addEventListener("input", (event) => {
      beginTimelineInteraction(viewer, playbackState);
      seekPlaybackFromTimeline(viewer, playbackState, event.target.value);
    });

    timelineSlider.addEventListener("change", (event) => {
      seekPlaybackFromTimeline(viewer, playbackState, event.target.value);
      endTimelineInteraction(viewer, playbackState);
    });

    timelineSlider.addEventListener("blur", () => {
      endTimelineInteraction(viewer, playbackState);
    });
  }

  if (timelineRangeStartSlider instanceof HTMLInputElement) {
    timelineRangeStartSlider.addEventListener("pointerdown", () => {
      beginTimelineInteraction(viewer, playbackState);
    });

    timelineRangeStartSlider.addEventListener("pointerup", () => {
      endTimelineInteraction(viewer, playbackState);
    });

    timelineRangeStartSlider.addEventListener("keydown", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        beginTimelineInteraction(viewer, playbackState);
      }
    });

    timelineRangeStartSlider.addEventListener("keyup", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        endTimelineInteraction(viewer, playbackState);
      }
    });

    timelineRangeStartSlider.addEventListener("input", (event) => {
      beginTimelineInteraction(viewer, playbackState);
      const nextStartTimestamp = fullSliderValueToTimestamp(
        playbackState,
        event.target.value,
      );
      setPlaybackRange(
        viewer,
        playbackState,
        nextStartTimestamp,
        Math.max(nextStartTimestamp, playbackState.endTimestamp),
      );
    });

    timelineRangeStartSlider.addEventListener("change", (event) => {
      const nextStartTimestamp = fullSliderValueToTimestamp(
        playbackState,
        event.target.value,
      );
      setPlaybackRange(
        viewer,
        playbackState,
        nextStartTimestamp,
        Math.max(nextStartTimestamp, playbackState.endTimestamp),
      );
      endTimelineInteraction(viewer, playbackState);
    });

    timelineRangeStartSlider.addEventListener("blur", () => {
      endTimelineInteraction(viewer, playbackState);
    });
  }

  if (timelineRangeEndSlider instanceof HTMLInputElement) {
    timelineRangeEndSlider.addEventListener("pointerdown", () => {
      beginTimelineInteraction(viewer, playbackState);
    });

    timelineRangeEndSlider.addEventListener("pointerup", () => {
      endTimelineInteraction(viewer, playbackState);
    });

    timelineRangeEndSlider.addEventListener("keydown", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        beginTimelineInteraction(viewer, playbackState);
      }
    });

    timelineRangeEndSlider.addEventListener("keyup", (event) => {
      if (TIMELINE_SCRUB_KEYS.has(event.key)) {
        endTimelineInteraction(viewer, playbackState);
      }
    });

    timelineRangeEndSlider.addEventListener("input", (event) => {
      beginTimelineInteraction(viewer, playbackState);
      const nextEndTimestamp = fullSliderValueToTimestamp(
        playbackState,
        event.target.value,
      );
      setPlaybackRange(
        viewer,
        playbackState,
        Math.min(playbackState.startTimestamp, nextEndTimestamp),
        nextEndTimestamp,
      );
    });

    timelineRangeEndSlider.addEventListener("change", (event) => {
      const nextEndTimestamp = fullSliderValueToTimestamp(
        playbackState,
        event.target.value,
      );
      setPlaybackRange(
        viewer,
        playbackState,
        Math.min(playbackState.startTimestamp, nextEndTimestamp),
        nextEndTimestamp,
      );
      endTimelineInteraction(viewer, playbackState);
    });

    timelineRangeEndSlider.addEventListener("blur", () => {
      endTimelineInteraction(viewer, playbackState);
    });
  }

  resetTimelineRangeButton?.addEventListener("click", () => {
    setPlaybackRange(
      viewer,
      playbackState,
      playbackState.fullStartTimestamp,
      playbackState.fullEndTimestamp,
    );
  });
}

function applyParameterInputAttributes() {
  const cameraInputBindings = [
    ["cameraFollowDistanceInput", "followDistanceMeters"],
    ["cameraFollowAltitudeInput", "followAltitudeOffsetMeters"],
    ["cameraFollowPitchInput", "followPitchDegrees"],
    ["cameraLookAheadDistanceInput", "lookAheadDistanceMeters"],
    ["cameraLookAheadWindowInput", "lookAheadPointWindow"],
    ["cameraSmoothingStrengthInput", "smoothingStrength"],
    ["cameraOverviewPitchInput", "overviewPitchDegrees"],
    ["cameraOverviewRangeMultiplierInput", "overviewRangeMultiplier"],
  ];

  for (const [elementId, settingKey] of cameraInputBindings) {
    applyNumericInputDefinition(elementId, CAMERA_SETTINGS_FIELDS[settingKey]);
  }

  // F-69: apply terrain parameter bounds from shared config so the terrain exaggeration control stays aligned with export settings.
  applyNumericInputDefinition(
    "terrainExaggerationInput",
    TERRAIN_SETTINGS_FIELDS.exaggeration,
  );
  // end F-69
  applyNumericInputDefinition(
    "overlaySpeedGaugeMaxInput",
    EXPORT_SETTINGS_FIELDS.speedGaugeMaxKph,
  );
  applyNumericInputDefinition("exportFpsInput", EXPORT_SETTINGS_FIELDS.fps);
  applyNumericInputDefinition(
    "exportSpeedInput",
    EXPORT_SETTINGS_FIELDS.speedMultiplier,
  );
  applyNumericInputDefinition(
    "exportAdaptiveStrengthInput",
    EXPORT_SETTINGS_FIELDS.adaptiveStrength,
  );
  applyNumericInputDefinition(
    "photoDisplayDurationInput",
    MEDIA_PRESENTATION_SETTINGS_FIELDS.photoDisplayDurationMs,
    {
      formatValue: (value) => {
        return Math.max(1, Math.round(value / 1000));
      },
    },
  );
}

// F-69: wire the terrain exaggeration control so terrain relief and grounded route geometry update together.
function setupTerrainControls(viewer, playbackState) {
  const terrainEnabledCheckbox = document.getElementById("terrainEnabledCheckbox");
  const terrainExaggerationInput = document.getElementById("terrainExaggerationInput");

  syncTerrainSettingsControls(playbackState);

  terrainEnabledCheckbox?.addEventListener("change", async (event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    await applyTerrainSettingsChange(viewer, playbackState, {
      enabled: target.checked,
    });
  });

  terrainExaggerationInput?.addEventListener("input", async (event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    await applyTerrainSettingsChange(viewer, playbackState, {
      exaggeration: target.value,
    });
  });

  terrainExaggerationInput?.addEventListener("change", async (event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    await applyTerrainSettingsChange(viewer, playbackState, {
      exaggeration: target.value,
    });
  });
}
// end F-69

function setupCameraSettingsControls(viewer, playbackState) {
  const fieldDefinitions = [
    ["cameraFollowDistanceInput", "followDistanceMeters"],
    ["cameraFollowAltitudeInput", "followAltitudeOffsetMeters"],
    ["cameraFollowPitchInput", "followPitchDegrees"],
    ["cameraLookAheadDistanceInput", "lookAheadDistanceMeters"],
    ["cameraLookAheadWindowInput", "lookAheadPointWindow"],
    ["cameraSmoothingStrengthInput", "smoothingStrength"],
    ["cameraOverviewPitchInput", "overviewPitchDegrees"],
    ["cameraOverviewRangeMultiplierInput", "overviewRangeMultiplier"],
  ];

  syncCameraSettingsControls(playbackState);

  for (const [elementId, settingKey] of fieldDefinitions) {
    const input = document.getElementById(elementId);

    input?.addEventListener("input", (event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      applyCameraSettingsChange(viewer, playbackState, {
        [settingKey]: target.value,
      });
    });

    input?.addEventListener("change", (event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      applyCameraSettingsChange(viewer, playbackState, {
        [settingKey]: target.value,
      });
    });
  }
}

function setupOverlayControls(playbackState) {
  syncOverlayControls(playbackState);
  applyOverlayVisibility(playbackState);
  const speedGaugeMaxInput = document.getElementById("overlaySpeedGaugeMaxInput");

  for (const component of OVERLAY_COMPONENT_DEFINITIONS) {
    const checkbox = document.getElementById(component.checkboxId);

    checkbox?.addEventListener("change", (event) => {
      const target = event.currentTarget;

      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      playbackState.ui.overlayVisibility = {
        ...normalizeOverlayVisibilityState(playbackState.ui.overlayVisibility),
        [component.key]: target.checked,
      };
      applyOverlayVisibility(playbackState);
    });
  }

  speedGaugeMaxInput?.addEventListener("input", (event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    playbackState.ui.speedGaugeMaxKph = normalizeSpeedGaugeMaxKph(target.value);
    updateMetricOverlay(playbackState);
  });

  speedGaugeMaxInput?.addEventListener("change", (event) => {
    const target = event.currentTarget;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    playbackState.ui.speedGaugeMaxKph = normalizeSpeedGaugeMaxKph(target.value);
    target.value = String(playbackState.ui.speedGaugeMaxKph);
    updateMetricOverlay(playbackState);
  });
}

function populateSelect(selectElement, items, selectedId) {
  if (!(selectElement instanceof HTMLSelectElement)) {
    return;
  }

  selectElement.innerHTML = "";

  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.label;
    option.selected = item.id === selectedId;
    selectElement.append(option);
  }
}

function getSelectedExportTimingMode() {
  const timingModeSelect = document.getElementById("exportTimingModeSelect");

  return timingModeSelect instanceof HTMLSelectElement
    ? timingModeSelect.value
    : EXPORT_OPTIONS.defaults.timingMode;
}

function getExportTimingModeSummary(timingMode) {
  if (timingMode === "fixed-speed") {
    return "Keeps a constant route-travel pace from the selected multiplier and skips stationary time almost entirely.";
  }

  if (timingMode === "proportional") {
    return "Uses the original activity timeline evenly with a single time-compression multiplier.";
  }

  return "Compresses idle sections more aggressively and slows down fast movement to keep it readable.";
}

function updateExportTimingControls() {
  const timingMode = getSelectedExportTimingMode();

  setElementHidden(
    "exportAdaptiveStrengthGroup",
    timingMode !== "adaptive-speed",
  );
  setTextContent(
    "exportSpeedLabel",
    timingMode === "adaptive-speed"
      ? "Base speed multiplier"
      : "Speed multiplier",
  );
  setTextContent("exportTimingModeSummary", getExportTimingModeSummary(timingMode));
}

function populateExportControls() {
  const resolutionSelect = document.getElementById("exportResolutionSelect");
  const cameraModeSelect = document.getElementById("exportCameraModeSelect");
  const timingModeSelect = document.getElementById("exportTimingModeSelect");
  const fpsInput = document.getElementById("exportFpsInput");
  const speedInput = document.getElementById("exportSpeedInput");
  const adaptiveStrengthInput = document.getElementById(
    "exportAdaptiveStrengthInput",
  );
  const photoDisplayDurationInput = document.getElementById(
    "photoDisplayDurationInput",
  );
  const photoKenBurnsCheckbox = document.getElementById("photoKenBurnsCheckbox");
  // F-76
  const mediaAnimationEffectSelect = document.getElementById("mediaAnimationEffectSelect");
  const photoAllowCropCheckbox = document.getElementById("photoAllowCropCheckbox");
  // end F-76

  populateSelect(
    resolutionSelect,
    EXPORT_OPTIONS.resolutionPresets,
    EXPORT_OPTIONS.defaults.resolutionId,
  );
  populateSelect(
    cameraModeSelect,
    EXPORT_OPTIONS.cameraModes,
    EXPORT_OPTIONS.defaults.cameraMode,
  );
  populateSelect(
    timingModeSelect,
    EXPORT_OPTIONS.timingModes,
    EXPORT_OPTIONS.defaults.timingMode,
  );

  if (fpsInput instanceof HTMLInputElement) {
    fpsInput.value = String(EXPORT_OPTIONS.defaults.fps);
  }

  if (speedInput instanceof HTMLInputElement) {
    speedInput.value = String(EXPORT_OPTIONS.defaults.speedMultiplier);
  }

  if (adaptiveStrengthInput instanceof HTMLInputElement) {
    adaptiveStrengthInput.value = String(EXPORT_OPTIONS.defaults.adaptiveStrength);
  }

  if (photoDisplayDurationInput instanceof HTMLInputElement) {
    photoDisplayDurationInput.value = String(
      Math.max(
        Math.max(
          1,
          Math.round(
            (MEDIA_PRESENTATION_SETTINGS_FIELDS.photoDisplayDurationMs?.min ?? 1) /
              1000,
          ),
        ),
        Math.round(EXPORT_OPTIONS.defaults.photoDisplayDurationMs / 1000),
      ),
    );
  }

  if (photoKenBurnsCheckbox instanceof HTMLInputElement) {
    photoKenBurnsCheckbox.checked = EXPORT_OPTIONS.defaults.photoKenBurnsEnabled;
  }

  // F-76: initialise animation effect select and crop checkbox.
  if (mediaAnimationEffectSelect instanceof HTMLSelectElement) {
    mediaAnimationEffectSelect.value =
      EXPORT_OPTIONS.defaults.animationEffect ?? "slide-up";
  }

  if (photoAllowCropCheckbox instanceof HTMLInputElement) {
    photoAllowCropCheckbox.checked =
      (EXPORT_OPTIONS.defaults.imageFit ?? "contain") === "cover";
  }
  // end F-76

  updateExportTimingControls();
}

function updateMediaLibraryUi() {
  const mediaCameraOffsetList = document.getElementById("mediaCameraOffsetList");
  const mediaLibraryList = document.getElementById("mediaLibraryList");
  const itemCount = mediaLibraryState.items.length;

  setTextContent(
    "mediaLibraryCount",
    `${itemCount} imported item${itemCount === 1 ? "" : "s"}`,
  );

  if (mediaLibraryState.isImporting) {
    setTextContent("mediaLibraryStatus", "Importing media files...");
  } else {
    setTextContent("mediaLibraryStatus", mediaLibraryState.statusMessage);
  }
  setTextContent(
    "mediaOffsetSummary",
    formatMediaCorrectionModelSummary(mediaLibraryState.items),
  );

  setElementDisabled(
    "importMediaButton",
    mediaLibraryState.isImporting || exportUiState.isExporting,
  );
  setProgressState(
    {
      bar: "mediaImportProgressBar",
      label: "mediaImportProgressLabel",
      value: "mediaImportProgressValue",
    },
    mediaLibraryState.progress,
  );

  if (mediaCameraOffsetList instanceof HTMLElement) {
    const cameraGroups = getDetectedCameraGroups(mediaLibraryState.items);
    mediaCameraOffsetList.innerHTML = "";

    if (cameraGroups.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "media-library-meta";
      emptyState.textContent =
        "No camera identity extracted yet. Unidentified files can still use per-media correction.";
      mediaCameraOffsetList.append(emptyState);
    } else {
      for (const cameraGroup of cameraGroups) {
        const label = document.createElement("label");
        label.className = "field-group";
        const title = document.createElement("span");
        title.className = "field-label";
        title.textContent = `Camera offset · ${cameraGroup.cameraIdentityLabel}`;
        const hint = document.createElement("span");
        hint.className = "media-library-meta";
        hint.textContent = `${cameraGroup.count} item${cameraGroup.count === 1 ? "" : "s"} from this camera`;
        const input = document.createElement("input");
        input.type = "number";
        input.dataset.offsetScope = "camera";
        input.dataset.cameraIdentityId = cameraGroup.cameraIdentityId;
        input.value = String(getCameraOffsetSeconds(cameraGroup.cameraIdentityId));
        input.disabled = exportUiState.isExporting || mediaLibraryState.isImporting;
        applyNumericDefinitionToElement(input, MEDIA_ALIGNMENT_FIELD);
        label.append(title, hint, input);
        mediaCameraOffsetList.append(label);
      }
    }
  }

  if (!(mediaLibraryList instanceof HTMLUListElement)) {
    return;
  }

  if (itemCount === 0) {
    mediaLibraryList.innerHTML =
      '<li class="media-library-empty">Imported photos and videos will appear here.</li>';
    return;
  }

  mediaLibraryList.innerHTML = "";

  for (const item of mediaLibraryState.items) {
    const listItem = document.createElement("li");
    listItem.className = "media-library-item";
    const thumbnail = document.createElement(
      item.mediaType === "image" && item.previewUrl ? "img" : "div",
    );
    thumbnail.className = "media-library-thumbnail";
    if (thumbnail instanceof HTMLImageElement) {
      thumbnail.alt = `Thumbnail for ${item.fileName}`;
      thumbnail.loading = "lazy";
      thumbnail.decoding = "async";
      thumbnail.src = item.previewUrl;
    } else {
      thumbnail.textContent = item.mediaType === "video" ? "VIDEO" : "PHOTO";
    }
    const content = document.createElement("div");
    content.className = "media-library-content";

    const name = document.createElement("p");
    name.className = "media-library-name";
    name.textContent = item.fileName;

    const meta = document.createElement("p");
    meta.className = "media-library-meta";
    meta.textContent = [
      formatMediaType(item.mediaType),
      formatMediaDuration(getMediaDurationMs(item)),
      item.filePath,
    ]
      .filter(Boolean)
      .join(" · ");

    const status = document.createElement("p");
    status.className = "media-library-status";
    status.textContent = formatTimestampMetadataStatus(
      item.timestampMetadataStatus,
    );

    const timestampDetails = document.createElement("p");
    timestampDetails.className = "media-library-meta";
    timestampDetails.textContent = formatMediaTimestampDetails(item);

    const correctionDetails = document.createElement("p");
    correctionDetails.className = "media-library-meta";
    correctionDetails.textContent = formatAdjustedMediaTimestampDetails(item);

    const cameraIdentity = document.createElement("p");
    cameraIdentity.className = "media-library-meta";
    cameraIdentity.textContent = formatMediaCameraIdentity(item);

    const alignmentStatus = document.createElement("p");
    alignmentStatus.className = "media-library-status";
    alignmentStatus.textContent = formatMediaAlignmentStatus(item.alignmentStatus);

    const alignmentDetails = document.createElement("p");
    alignmentDetails.className = "media-library-meta";
    alignmentDetails.textContent = formatMediaAlignmentDetails(item);

    const perMediaOffsetGroup = document.createElement("label");
    perMediaOffsetGroup.className = "field-group";
    const perMediaOffsetLabel = document.createElement("span");
    perMediaOffsetLabel.className = "field-label";
    perMediaOffsetLabel.textContent = "Per-media offset (s)";
    const perMediaOffsetInput = document.createElement("input");
    perMediaOffsetInput.type = "number";
    perMediaOffsetInput.dataset.offsetScope = "media";
    perMediaOffsetInput.dataset.mediaItemId = item.id;
    perMediaOffsetInput.value = String(getMediaOffsetSeconds(item.id));
    perMediaOffsetInput.disabled =
      exportUiState.isExporting || mediaLibraryState.isImporting;
    applyNumericDefinitionToElement(perMediaOffsetInput, MEDIA_ALIGNMENT_FIELD);
    perMediaOffsetGroup.append(perMediaOffsetLabel, perMediaOffsetInput);

    content.append(
      name,
      meta,
      status,
      timestampDetails,
      cameraIdentity,
      correctionDetails,
      alignmentStatus,
      alignmentDetails,
      perMediaOffsetGroup,
    );
    listItem.append(thumbnail, content);
    mediaLibraryList.append(listItem);
  }
}

// F-21: let drift corrections live at camera scope by default, with per-media overrides when needed.
function getDetectedCameraGroups(items) {
  const groupsById = new Map();

  for (const item of items) {
    if (!item.cameraIdentityId || !item.cameraIdentityLabel) {
      continue;
    }

    const existingGroup = groupsById.get(item.cameraIdentityId);

    if (existingGroup) {
      existingGroup.count += 1;
      continue;
    }

    groupsById.set(item.cameraIdentityId, {
      cameraIdentityId: item.cameraIdentityId,
      cameraIdentityLabel: item.cameraIdentityLabel,
      count: 1,
    });
  }

  return Array.from(groupsById.values()).sort((left, right) => {
    return left.cameraIdentityLabel.localeCompare(right.cameraIdentityLabel);
  });
}

function getCameraOffsetSeconds(cameraIdentityId) {
  return normalizeMediaAlignmentOffsetValue(
    mediaLibraryState.alignmentOffsets.cameraOffsetsByCameraId?.[cameraIdentityId],
  );
}

function getMediaOffsetSeconds(mediaItemId) {
  return normalizeMediaAlignmentOffsetValue(
    mediaLibraryState.alignmentOffsets.mediaOffsetsByMediaId?.[mediaItemId],
  );
}

function syncMediaAlignmentControls() {
  mediaLibraryState.alignmentOffsets = normalizeMediaAlignmentOffsets(
    mediaLibraryState.alignmentOffsets,
  );
}

function buildMediaLibraryStatusMessage() {
  if (mediaLibraryState.items.length === 0) {
    return "No media imported yet.";
  }

  const detectedCameraGroups = getDetectedCameraGroups(mediaLibraryState.items);
  const alignedCount = mediaLibraryState.items.filter((item) => {
    return item.alignmentStatus === "aligned";
  }).length;
  const outOfRangeCount = mediaLibraryState.items.filter((item) => {
    return (
      item.alignmentStatus === "before-start" ||
      item.alignmentStatus === "after-end"
    );
  }).length;

  return `Library has ${mediaLibraryState.items.length} item${mediaLibraryState.items.length === 1 ? "" : "s"}; ${alignedCount} aligned, ${outOfRangeCount} out of range, ${detectedCameraGroups.length} detected camera group${detectedCameraGroups.length === 1 ? "" : "s"}.`;
}

function applyMediaAlignmentToLibrary(playbackState, mediaItems = mediaLibraryState.items) {
  mediaLibraryState.alignmentOffsets = normalizeMediaAlignmentOffsets(
    mediaLibraryState.alignmentOffsets,
  );
  mediaLibraryState.items = decorateMediaItemsForPreview(
    alignMediaLibraryItemsToTrack(mediaItems, playbackState.trackpoints),
  );
  mediaLibraryState.statusMessage = buildMediaLibraryStatusMessage();
}

function refreshMediaLibraryPresentation(viewer, playbackState) {
  syncMediaAlignmentControls();
  updateMediaLibraryUi();
  syncMediaPreviewEntities(viewer, playbackState);
  if (playbackState) {
    void updateMediaPreviewOverlay(playbackState);
  }
}

function updateCameraOffset(cameraIdentityId, rawValue) {
  mediaLibraryState.alignmentOffsets = normalizeMediaAlignmentOffsets({
    ...mediaLibraryState.alignmentOffsets,
    cameraOffsetsByCameraId: {
      ...mediaLibraryState.alignmentOffsets.cameraOffsetsByCameraId,
      [cameraIdentityId]: rawValue,
    },
  });
}

function updateMediaOffset(mediaItemId, rawValue) {
  mediaLibraryState.alignmentOffsets = normalizeMediaAlignmentOffsets({
    ...mediaLibraryState.alignmentOffsets,
    mediaOffsetsByMediaId: {
      ...mediaLibraryState.alignmentOffsets.mediaOffsetsByMediaId,
      [mediaItemId]: rawValue,
    },
  });
}

function setupMediaLibraryControls(viewer, playbackState) {
  const importMediaButton = document.getElementById("importMediaButton");
  const mediaLibraryList = document.getElementById("mediaLibraryList");
  const mediaCameraOffsetList = document.getElementById("mediaCameraOffsetList");

  syncMediaAlignmentControls();

  const handleOffsetInputEvent = (event) => {
    const target = event.target;

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    if (target.dataset.offsetScope === "camera" && target.dataset.cameraIdentityId) {
      updateCameraOffset(target.dataset.cameraIdentityId, target.value);
      applyMediaAlignmentToLibrary(playbackState);
      refreshMediaLibraryPresentation(viewer, playbackState);
      return;
    }

    if (target.dataset.offsetScope === "media" && target.dataset.mediaItemId) {
      updateMediaOffset(target.dataset.mediaItemId, target.value);
      applyMediaAlignmentToLibrary(playbackState);
      refreshMediaLibraryPresentation(viewer, playbackState);
    }
  };

  mediaCameraOffsetList?.addEventListener("input", handleOffsetInputEvent);
  mediaCameraOffsetList?.addEventListener("change", handleOffsetInputEvent);
  mediaLibraryList?.addEventListener("input", handleOffsetInputEvent);
  mediaLibraryList?.addEventListener("change", handleOffsetInputEvent);

  importMediaButton?.addEventListener("click", async () => {
    mediaLibraryState.isImporting = true;
    mediaLibraryState.progress = {
      indeterminate: true,
      label: "Selecting media files",
      status: "running",
      value: 10,
    };
    updateMediaLibraryUi();

    try {
      const result = await window.bikeFlyOverApp.importMedia();

      if (!result?.cancelled && Array.isArray(result?.mediaItems)) {
        mediaLibraryState.progress = {
          indeterminate: true,
          label: "Reading metadata and aligning media",
          status: "running",
          value: 70,
        };
        updateMediaLibraryUi();
        applyMediaAlignmentToLibrary(
          playbackState,
          mergeImportedMedia(mediaLibraryState.items, result.mediaItems),
        );
        mediaLibraryState.statusMessage =
          result.mediaItems.length > 0
            ? buildMediaLibraryStatusMessage()
            : "No supported media files were added.";
        mediaLibraryState.progress = {
          indeterminate: false,
          label: result.mediaItems.length > 0 ? "Import complete" : "No supported files",
          status: result.mediaItems.length > 0 ? "complete" : "idle",
          value: result.mediaItems.length > 0 ? 100 : 0,
        };
        refreshMediaLibraryPresentation(viewer, playbackState);
      } else if (result?.cancelled) {
        mediaLibraryState.statusMessage =
          mediaLibraryState.items.length > 0
            ? "Import cancelled."
            : "No media imported yet.";
        mediaLibraryState.progress = {
          indeterminate: false,
          label: "Import cancelled",
          status: "cancelled",
          value: 0,
        };
      }
    } catch (error) {
      mediaLibraryState.statusMessage =
        error instanceof Error ? error.message : String(error);
      mediaLibraryState.progress = {
        indeterminate: false,
        label: "Import failed",
        status: "error",
        value: 100,
      };
    } finally {
      mediaLibraryState.isImporting = false;
      refreshMediaLibraryPresentation(viewer, playbackState);
    }
  });
}
// end F-21

function updateExportUi(statusUpdate) {
  const currentFrame = statusUpdate.currentFrame || 0;
  const totalFrames = statusUpdate.totalFrames || 0;

  setTextContent("exportStatus", statusUpdate.status || "Idle");
  setTextContent("exportPhase", statusUpdate.phase || "-");
  setTextContent(
    "exportProgress",
    totalFrames ? formatFrameProgress(currentFrame, totalFrames) : "-",
  );
  setTextContent("exportMessage", statusUpdate.message || "Idle.");
  setProgressState(
    {
      bar: "exportProgressBar",
      label: "exportProgressLabel",
      value: "exportProgressValue",
    },
    getExportProgressState(statusUpdate),
  );

  exportUiState.isExporting = ["starting", "running", "encoding"].includes(
    statusUpdate.status,
  );
  setElementDisabled("startExportButton", exportUiState.isExporting);
  setElementDisabled("cancelExportButton", !exportUiState.isExporting);
  setElementDisabled("exportResolutionSelect", exportUiState.isExporting);
  setElementDisabled("exportTimingModeSelect", exportUiState.isExporting);
  setElementDisabled("exportFpsInput", exportUiState.isExporting);
  setElementDisabled("exportSpeedInput", exportUiState.isExporting);
  setElementDisabled("exportAdaptiveStrengthInput", exportUiState.isExporting);
  setElementDisabled("exportCameraModeSelect", exportUiState.isExporting);
  setElementDisabled("cameraModeButton", exportUiState.isExporting);
  setElementDisabled("cameraFollowDistanceInput", exportUiState.isExporting);
  setElementDisabled("cameraFollowAltitudeInput", exportUiState.isExporting);
  setElementDisabled("cameraFollowPitchInput", exportUiState.isExporting);
  setElementDisabled("cameraLookAheadDistanceInput", exportUiState.isExporting);
  setElementDisabled("cameraLookAheadWindowInput", exportUiState.isExporting);
  setElementDisabled("cameraSmoothingStrengthInput", exportUiState.isExporting);
  setElementDisabled("cameraOverviewPitchInput", exportUiState.isExporting);
  setElementDisabled("cameraOverviewRangeMultiplierInput", exportUiState.isExporting);
  setElementDisabled("terrainEnabledCheckbox", exportUiState.isExporting);
  setElementDisabled("terrainExaggerationInput", exportUiState.isExporting);
  setElementDisabled("photoDisplayDurationInput", exportUiState.isExporting);
  setElementDisabled("photoKenBurnsCheckbox", exportUiState.isExporting);
  // F-76
  setElementDisabled("mediaAnimationEffectSelect", exportUiState.isExporting);
  setElementDisabled("photoAllowCropCheckbox", exportUiState.isExporting);
  // end F-76
  setElementDisabled("overlayTimeMetricCheckbox", exportUiState.isExporting);
  setElementDisabled("overlayDistanceMetricCheckbox", exportUiState.isExporting);
  setElementDisabled("overlayAltitudeMetricCheckbox", exportUiState.isExporting);
  setElementDisabled("overlayCadenceMetricCheckbox", exportUiState.isExporting);
  setElementDisabled("overlayTemperatureMetricCheckbox", exportUiState.isExporting);
  setElementDisabled("overlaySpeedGaugeCheckbox", exportUiState.isExporting);
  setElementDisabled("overlaySpeedTextCheckbox", exportUiState.isExporting);
  setElementDisabled("overlayHeartRateGaugeCheckbox", exportUiState.isExporting);
  setElementDisabled("overlaySpeedGaugeMaxInput", exportUiState.isExporting);
  setElementDisabled(
    "importMediaButton",
    exportUiState.isExporting || mediaLibraryState.isImporting,
  );
}

function readExportSettings() {
  const resolutionSelect = document.getElementById("exportResolutionSelect");
  const timingModeSelect = document.getElementById("exportTimingModeSelect");
  const fpsInput = document.getElementById("exportFpsInput");
  const speedInput = document.getElementById("exportSpeedInput");
  const adaptiveStrengthInput = document.getElementById(
    "exportAdaptiveStrengthInput",
  );
  const cameraModeSelect = document.getElementById("exportCameraModeSelect");
  const mediaPresentationSettings = readMediaPresentationSettings();

  return {
    resolutionId:
      resolutionSelect instanceof HTMLSelectElement
        ? resolutionSelect.value
        : EXPORT_OPTIONS.defaults.resolutionId,
    timingMode:
      timingModeSelect instanceof HTMLSelectElement
        ? timingModeSelect.value
        : EXPORT_OPTIONS.defaults.timingMode,
    fps:
      fpsInput instanceof HTMLInputElement
        ? Number(fpsInput.value)
        : EXPORT_OPTIONS.defaults.fps,
    speedMultiplier:
      speedInput instanceof HTMLInputElement
        ? Number(speedInput.value)
        : EXPORT_OPTIONS.defaults.speedMultiplier,
    adaptiveStrength:
      adaptiveStrengthInput instanceof HTMLInputElement
        ? Number(adaptiveStrengthInput.value)
        : EXPORT_OPTIONS.defaults.adaptiveStrength,
    cameraMode:
      cameraModeSelect instanceof HTMLSelectElement
        ? cameraModeSelect.value
        : EXPORT_OPTIONS.defaults.cameraMode,
    rangeStartTimestamp: window.playbackState?.startTimestamp,
    rangeEndTimestamp: window.playbackState?.endTimestamp,
    mediaItems: mediaLibraryState.items,
    overlayVisibility: normalizeOverlayVisibilityState(
      window.playbackState?.ui?.overlayVisibility,
    ),
    speedGaugeMaxKph: normalizeSpeedGaugeMaxKph(
      window.playbackState?.ui?.speedGaugeMaxKph,
    ),
    cameraSettings: normalizeCameraSettings(window.playbackState?.camera?.settings),
    // F-69: include terrain settings in export payloads so exported frames use the same terrain exaggeration as preview.
    terrainSettings: normalizeTerrainSettings(window.playbackState?.terrain?.settings),
    // end F-69
    photoDisplayDurationMs: mediaPresentationSettings.photoDisplayDurationMs,
    photoKenBurnsEnabled: mediaPresentationSettings.photoKenBurnsEnabled,
    // F-76
    animationEffect: mediaPresentationSettings.animationEffect,
    imageFit: mediaPresentationSettings.imageFit,
    // end F-76
  };
}

function setupExportControls() {
  const startExportButton = document.getElementById("startExportButton");
  const cancelExportButton = document.getElementById("cancelExportButton");
  const timingModeSelect = document.getElementById("exportTimingModeSelect");
  const photoDisplayDurationInput = document.getElementById(
    "photoDisplayDurationInput",
  );
  const photoKenBurnsCheckbox = document.getElementById("photoKenBurnsCheckbox");
  // F-76
  const mediaAnimationEffectSelect = document.getElementById("mediaAnimationEffectSelect");
  const photoAllowCropCheckbox = document.getElementById("photoAllowCropCheckbox");
  // end F-76

  timingModeSelect?.addEventListener("change", () => {
    updateExportTimingControls();
  });

  photoDisplayDurationInput?.addEventListener("input", () => {
    if (window.playbackState) {
      void updateMediaPreviewOverlay(window.playbackState);
    }
  });
  photoKenBurnsCheckbox?.addEventListener("change", () => {
    if (window.playbackState) {
      void updateMediaPreviewOverlay(window.playbackState);
    }
  });
  // F-76: refresh overlay preview when animation effect or crop mode changes.
  mediaAnimationEffectSelect?.addEventListener("change", () => {
    if (window.playbackState) {
      void updateMediaPreviewOverlay(window.playbackState);
    }
  });
  photoAllowCropCheckbox?.addEventListener("change", () => {
    if (window.playbackState) {
      void updateMediaPreviewOverlay(window.playbackState);
    }
  });
  // end F-76

  window.bikeFlyOverApp?.onExportStatus((statusUpdate) => {
    updateExportUi(statusUpdate);
  });

  startExportButton?.addEventListener("click", async () => {
    updateExportUi({
      status: "starting",
      phase: "preparing",
      message: "Opening save dialog and preparing the current viewer for export.",
      currentFrame: 0,
      totalFrames: 0,
    });

    try {
      const result = await window.bikeFlyOverApp.startExport(readExportSettings());

      if (result?.cancelled) {
        updateExportUi({
          status: "idle",
          phase: "-",
          message: "Export cancelled before rendering started.",
          currentFrame: 0,
          totalFrames: 0,
        });
      }
    } catch (error) {
      updateExportUi({
        status: "failed",
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
        currentFrame: 0,
        totalFrames: 0,
      });
    }
  });

  cancelExportButton?.addEventListener("click", async () => {
    try {
      await window.bikeFlyOverApp.cancelExport();
    } catch (error) {
      updateExportUi({
        status: "failed",
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
        currentFrame: 0,
        totalFrames: 0,
      });
    }
  });
}

function createPreviewSnapshot(playbackState) {
  return {
    adaptiveStrength: playbackState.camera.adaptiveStrength,
    cameraMode: playbackState.camera.mode,
    // F-69: snapshot terrain settings so export/reset restores the same exaggerated terrain state.
    terrainSettings: normalizeTerrainSettings(playbackState.terrain.settings),
    // end F-69
    currentTimestamp: playbackState.currentTimestamp,
    isPlaying: playbackState.isPlaying,
    overlayVisibility: normalizeOverlayVisibilityState(
      playbackState.ui.overlayVisibility,
    ),
    speedGaugeMaxKph: normalizeSpeedGaugeMaxKph(playbackState.ui.speedGaugeMaxKph),
    cameraSettings: normalizeCameraSettings(playbackState.camera.settings),
    speedGaugePeakKph: Number.isFinite(playbackState.ui.speedGaugePeakKph)
      ? playbackState.ui.speedGaugePeakKph
      : 0,
    speedGaugePeakTimestamp: Number.isFinite(playbackState.ui.speedGaugePeakTimestamp)
      ? playbackState.ui.speedGaugePeakTimestamp
      : playbackState.currentTimestamp,
    speedMultiplier: playbackState.speedMultiplier,
  };
}

async function restorePreviewSnapshot(viewer, playbackState, previewSnapshot) {
  if (!previewSnapshot) {
    return;
  }

  playbackState.export.cancelRequested = false;
  applyRendererSettings(viewer, playbackState, previewSnapshot, {
    resetCameraSmoothing: true,
    syncControls: true,
  });
  playbackState.ui.speedGaugePeakKph = Number.isFinite(previewSnapshot.speedGaugePeakKph)
    ? previewSnapshot.speedGaugePeakKph
    : 0;
  playbackState.ui.speedGaugePeakTimestamp = Number.isFinite(
    previewSnapshot.speedGaugePeakTimestamp,
  )
    ? previewSnapshot.speedGaugePeakTimestamp
    : previewSnapshot.currentTimestamp;
  playbackState.isPlaying = false;
  await refreshTerrainRouteGeometry(viewer, playbackState, {
    updateTimelineState: false,
  });
  setPlaybackTimestamp(viewer, playbackState, previewSnapshot.currentTimestamp);

  if (previewSnapshot.isPlaying) {
    startPlayback(viewer, playbackState);
  }
}

function applyRendererSettings(viewer, playbackState, settings, options = {}) {
  playbackState.speedMultiplier = settings.speedMultiplier;
  playbackState.camera.mode = settings.cameraMode;
  playbackState.camera.adaptiveStrength = settings.adaptiveStrength;
  playbackState.camera.settings = normalizeCameraSettings(settings.cameraSettings);
  // F-69: apply shared terrain settings whenever renderer state is restored so preview/export keep the same exaggeration.
  playbackState.terrain.settings = normalizeTerrainSettings(settings.terrainSettings);
  applyTerrainSceneSettings(viewer, playbackState);
  // end F-69
  playbackState.ui.speedGaugeMaxKph = normalizeSpeedGaugeMaxKph(
    settings.speedGaugeMaxKph,
  );
  playbackState.ui.overlayVisibility = normalizeOverlayVisibilityState(
    settings.overlayVisibility,
  );

  // F-73: scale speedometer size proportionally to export width; remove override during preview so CSS default applies
  const overlayRoot = document.getElementById("metricOverlay");
  if (overlayRoot instanceof HTMLElement) {
    if (Number.isFinite(settings.width) && settings.width > 0) {
      const gaugeSize = Math.round(
        Math.min(
          OVERLAY_GAUGE_MAX_PX,
          Math.max(
            OVERLAY_GAUGE_MIN_PX,
            OVERLAY_GAUGE_REFERENCE_PX * (settings.width / OVERLAY_GAUGE_REFERENCE_WIDTH),
          ),
        ),
      );
      overlayRoot.style.setProperty("--overlay-gauge-size", `${gaugeSize}px`);
    } else {
      overlayRoot.style.removeProperty("--overlay-gauge-size");
    }
  }
  // end F-73

  if (options.resetCameraSmoothing) {
    resetFollowCameraSmoothing(playbackState);
  }

  if (options.syncControls) {
    syncOverlayControls(playbackState);
    syncCameraSettingsControls(playbackState);
    syncTerrainSettingsControls(playbackState);
  }

  if (options.applyOverlayVisibility !== false) {
    applyOverlayVisibility(playbackState);
  }
}

function setExportSessionState(viewer, enabled) {
  document.body.classList.toggle("export-session-active", enabled);
  setMediaPreviewEntitiesVisibility(!enabled);
  viewer.resize();
}

async function applyRendererFrame(viewer, playbackState, frameState, options = {}) {
  const {
    activeMedia = undefined,
    deterministicCamera = false,
    isCancelled = () => false,
    settleSettings = null,
    updateUi = false,
    waitForMedia = false,
  } = options;

  setPlaybackTimestamp(viewer, playbackState, frameState.activityTimestamp, {
    updateMediaPreview: false,
    updateUi,
    deterministicCamera,
  });
  await updateMediaPreviewOverlay(playbackState, {
    awaitVideoFrame: waitForMedia,
    activeMedia,
  });

  if (settleSettings) {
    await settleSceneForCapture(viewer, settleSettings, isCancelled);
  }
}

function waitForNextRender(scene, timeoutMs, isCancelled) {
  if (isCancelled()) {
    return Promise.reject(new Error("Export cancelled."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      scene.postRender.removeEventListener(onPostRender);
    };

    const rejectWithError = (error) => {
      cleanup();
      reject(error);
    };

    const onPostRender = () => {
      if (isCancelled()) {
        rejectWithError(new Error("Export cancelled."));
        return;
      }

      cleanup();
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      rejectWithError(
        new Error(`Timed out waiting for Cesium to render within ${timeoutMs}ms.`),
      );
    }, timeoutMs);

    scene.postRender.addEventListener(onPostRender);
    scene.requestRender();
  });
}

async function settleSceneForCapture(viewer, settings, isCancelled) {
  const scene = viewer.scene;
  let stablePasses = 0;
  let lastQueueLength = scene.globe.tilesLoaded ? 0 : 1;

  const onTileLoadProgress = (queueLength) => {
    lastQueueLength = queueLength;
  };

  scene.globe.tileLoadProgressEvent.addEventListener(onTileLoadProgress);

  try {
    while (stablePasses < settings.settleStablePasses) {
      await waitForNextRender(scene, settings.settleTimeoutMs, isCancelled);

      if (scene.globe.tilesLoaded && lastQueueLength === 0) {
        stablePasses += 1;
      } else {
        stablePasses = 0;
      }
    }

    await waitForNextRender(scene, settings.settleTimeoutMs, isCancelled);
  } finally {
    scene.globe.tileLoadProgressEvent.removeEventListener(onTileLoadProgress);
  }
}

async function renderExportFrame(viewer, playbackState, payload) {
  stopPlayback(playbackState);
  playbackState.isPlaying = false;
  applyRendererSettings(viewer, playbackState, payload.settings);
  // Route geometry was already initialised in onExportPrepare; rebuilding it every frame
  // reassigns Cesium polyline positions each render pass, which causes the not-yet-played
  // route to flash/flicker (Cesium marks the primitive dirty and may render a blank frame
  // while rebuilding GPU geometry). Terrain heights and route positions are constant for
  // the entire export session, so there is nothing to rebuild here.
  await applyRendererFrame(
    viewer,
    playbackState,
    {
      activityTimestamp: payload.activityTimestamp,
    },
    {
      activeMedia: payload.activeMedia || null,
      isCancelled: () => {
        return playbackState.export.cancelRequested;
      },
      settleSettings: payload.settings,
      waitForMedia: true,
    },
  );
}

function setupExportRenderBridge(viewer, playbackState) {
  const exportBridgeState = {
    previewSnapshot: null,
  };

  window.bikeFlyOverApp?.onExportCancel(() => {
    playbackState.export.cancelRequested = true;
  });

  window.bikeFlyOverApp?.onExportPrepare(async (payload) => {
    exportBridgeState.previewSnapshot = createPreviewSnapshot(playbackState);

    if (playbackState.isPlaying) {
      pausePlayback(viewer, playbackState);
    } else {
      stopPlayback(playbackState);
      playbackState.isPlaying = false;
    }

    playbackState.export.cancelRequested = false;
    setExportSessionState(viewer, true);
    applyRendererSettings(viewer, playbackState, payload.settings, {
      resetCameraSmoothing: true,
      syncControls: true,
    });
    await refreshTerrainRouteGeometry(viewer, playbackState, {
      updateTimelineState: false,
    });

    try {
      await applyRendererFrame(
        viewer,
        playbackState,
        {
          activityTimestamp: playbackState.startTimestamp,
        },
        {
          activeMedia: null,
          settleSettings: payload.settings,
          waitForMedia: false,
        },
      );
      window.bikeFlyOverApp.notifyExportPrepared();
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      window.bikeFlyOverApp.notifyError(message, {
        mode: RENDER_MODE,
      });
    }
  });

  window.bikeFlyOverApp?.onExportReset(async () => {
    setExportSessionState(viewer, false);
    await restorePreviewSnapshot(viewer, playbackState, exportBridgeState.previewSnapshot);
    void updateMediaPreviewOverlay(playbackState);
    exportBridgeState.previewSnapshot = null;
  });

  window.bikeFlyOverApp?.onRenderExportFrame(async (payload) => {
    playbackState.export.cancelRequested = false;

    try {
      await renderExportFrame(viewer, playbackState, payload);
      window.bikeFlyOverApp.notifyExportFrameSettled({
        frameIndex: payload.frameIndex,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      window.bikeFlyOverApp.notifyError(message, {
        frameIndex: payload.frameIndex,
        mode: RENDER_MODE,
      });
    }
  });
}

async function initializeApp() {
  document.body.classList.toggle("export-mode", RENDER_MODE === "export");

  try {
    if (!EXPORT_OPTIONS?.defaults || !EXPORT_OPTIONS?.parameterConfig) {
      throw new Error("Export options are unavailable in the renderer.");
    }
    if (!MEDIA_ALIGNMENT_OPTIONS?.defaults || !MEDIA_ALIGNMENT_OPTIONS?.parameterConfig) {
      throw new Error("Media alignment options are unavailable in the renderer.");
    }

    setRouteStatus("Loading satellite basemap...");
    const viewer = createViewer(RENDER_MODE);
    const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();
    const playbackState = createPlaybackState(sampleTrack.trackpoints, {
      adaptiveStrength: EXPORT_OPTIONS.defaults.adaptiveStrength,
      speedMultiplier: EXPORT_OPTIONS.defaults.speedMultiplier,
      cameraMode: EXPORT_OPTIONS.defaults.cameraMode,
      cameraSettings: EXPORT_OPTIONS.defaults.cameraSettings,
      // F-69: seed playback with shared terrain defaults so terrain exaggeration is identical in preview/export.
      terrainSettings: EXPORT_OPTIONS.defaults.terrainSettings,
      // end F-69
    });
    await initializeViewerTerrain(viewer, playbackState);
    const { routeBoundingSphere, routeEntity, routePositions } = addRouteEntities(
      viewer,
      playbackState,
      sampleTrack,
    );

    playbackState.routePositions = routePositions;
    playbackState.currentSamplePosition = routePositions[0] || null;
    playbackState.camera.routeBoundingSphere = routeBoundingSphere;
    playbackState.camera.routeEntity = routeEntity;

    addPlaybackEntities(viewer, playbackState);
    renderSummary(sampleTrack);
    setOverviewCamera(viewer, playbackState);
    setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp, {
      deterministicCamera: RENDER_MODE === "export",
      updateUi: RENDER_MODE !== "export",
    });

    window.bikeFlyOverViewer = viewer;
    window.sampleTrack = sampleTrack;
    window.sampleRouteEntity = routeEntity;
    window.playbackState = playbackState;

    if (RENDER_MODE === "preview") {
      applyParameterInputAttributes();
      updatePlaybackUI(playbackState);
      updateCameraUI(playbackState);
      populateExportControls();
      syncTerrainSettingsControls(playbackState);
      updateExportUi({
        status: "idle",
        phase: "-",
        message: "Idle.",
        currentFrame: 0,
        totalFrames: 0,
      });
      updateMediaLibraryUi();
      void updateMediaPreviewOverlay(playbackState);
      setupExportRenderBridge(viewer, playbackState);
      setupMediaLibraryControls(viewer, playbackState);
      setupPlaybackControls(viewer, playbackState);
      setupCameraSettingsControls(viewer, playbackState);
      setupTerrainControls(viewer, playbackState);
      setupOverlayControls(playbackState);
      setupExportControls();
      startPlayback(viewer, playbackState);
      setRouteStatus(
        "Completed route is bright blue; upcoming route stays thin white.",
      );
      setStatus(`Following ${sampleTrack.fileName} with a trailing 3D camera.`);
    }

    window.bikeFlyOverApp?.notifyReady({
      mode: RENDER_MODE,
    });
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error ? error.stack || error.message : String(error);

    setStatus("Cesium initialization failed.");
    window.bikeFlyOverApp?.notifyError(message, {
      mode: RENDER_MODE,
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});
