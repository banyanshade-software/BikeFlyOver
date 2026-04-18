const {
  MEDIA_PRESENTATION_DEFAULTS,
  buildMediaPresentationState,
  compareMediaPresentationItems,
  getMediaDurationMs,
  getMediaPresentationTimeline,
  normalizeMediaPresentationSettings,
} = require("./media-presentation");
const {
  CAMERA_SETTINGS_DEFAULTS,
  CAMERA_SETTINGS_FIELDS,
  EXPORT_ENUM_DEFAULTS,
  EXPORT_SETTINGS_DEFAULTS,
  EXPORT_SETTINGS_FIELDS,
  OVERLAY_VISIBILITY_DEFAULTS,
  // F-69: import terrain defaults/limits from shared parameter config so export and preview use one terrain model.
  TERRAIN_SETTINGS_DEFAULTS,
  TERRAIN_SETTINGS_FIELDS,
  // end F-69
} = require("./parameter-config");

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
    id: "square-220",
    label: "220 x 220 (Square / Test)",
    width: 220,
    height: 220,
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

const EXPORT_TIMING_MODES = [
  { id: "adaptive-speed", label: "Adaptive speed" },
  { id: "proportional", label: "Proportional track time" },
  { id: "fixed-speed", label: "Fixed route speed" },
];

const EXPORT_DEFAULTS = {
  resolutionId: EXPORT_ENUM_DEFAULTS.resolutionId,
  width:
    getResolutionPresetById(EXPORT_ENUM_DEFAULTS.resolutionId)?.width ??
    EXPORT_RESOLUTION_PRESETS[0].width,
  height:
    getResolutionPresetById(EXPORT_ENUM_DEFAULTS.resolutionId)?.height ??
    EXPORT_RESOLUTION_PRESETS[0].height,
  fps: EXPORT_SETTINGS_DEFAULTS.fps,
  timingMode: EXPORT_ENUM_DEFAULTS.timingMode,
  speedMultiplier: EXPORT_SETTINGS_DEFAULTS.speedMultiplier,
  adaptiveStrength: EXPORT_SETTINGS_DEFAULTS.adaptiveStrength,
  cameraMode: EXPORT_ENUM_DEFAULTS.cameraMode,
  settleTimeoutMs: EXPORT_SETTINGS_DEFAULTS.settleTimeoutMs,
  settleStablePasses: EXPORT_SETTINGS_DEFAULTS.settleStablePasses,
  maxFrameRetries: EXPORT_SETTINGS_DEFAULTS.maxFrameRetries,
  speedGaugeMaxKph: EXPORT_SETTINGS_DEFAULTS.speedGaugeMaxKph,
  cameraSettings: CAMERA_SETTINGS_DEFAULTS,
  // F-69: include terrain defaults in export settings so preview/export share exaggeration and route offset behavior.
  terrainSettings: TERRAIN_SETTINGS_DEFAULTS,
  // end F-69
  photoDisplayDurationMs: MEDIA_PRESENTATION_DEFAULTS.photoDisplayDurationMs,
  photoKenBurnsEnabled: MEDIA_PRESENTATION_DEFAULTS.photoKenBurnsEnabled,
  enterDurationMs: MEDIA_PRESENTATION_DEFAULTS.enterDurationMs,
  exitDurationMs: MEDIA_PRESENTATION_DEFAULTS.exitDurationMs,
  // F-76
  animationEffect: MEDIA_PRESENTATION_DEFAULTS.animationEffect,
  imageFit: MEDIA_PRESENTATION_DEFAULTS.imageFit,
  // end F-76
  overlayVisibility: OVERLAY_VISIBILITY_DEFAULTS,
};

function getResolutionPresetById(resolutionId) {
  return (
    EXPORT_RESOLUTION_PRESETS.find((preset) => preset.id === resolutionId) || null
  );
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, ratio) {
  return start + (end - start) * ratio;
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

function clampToFieldDefinition(value, definition) {
  return clamp(
    value,
    definition?.min ?? Number.NEGATIVE_INFINITY,
    definition?.max ?? Number.POSITIVE_INFINITY,
  );
}

// F-74: handle boolean overlay fields; enum type support removed — speedDisplayMode replaced by separate speedText flag
function normalizeOverlayVisibilitySettings(rawVisibility = {}) {
  return Object.keys(OVERLAY_VISIBILITY_DEFAULTS).reduce((visibility, key) => {
    const raw = rawVisibility?.[key];
    visibility[key] = typeof raw === "boolean" ? raw : OVERLAY_VISIBILITY_DEFAULTS[key];
    return visibility;
  }, {});
}
// end F-74

function normalizeCameraSettings(rawCameraSettings = {}) {
  return {
    followDistanceMeters: clamp(
      normalizePositiveNumber(
        rawCameraSettings.followDistanceMeters ??
          CAMERA_SETTINGS_DEFAULTS.followDistanceMeters,
        "cameraSettings.followDistanceMeters",
      ),
      CAMERA_SETTINGS_FIELDS.followDistanceMeters.min,
      CAMERA_SETTINGS_FIELDS.followDistanceMeters.max,
    ),
    followAltitudeOffsetMeters: clamp(
      normalizePositiveNumber(
        rawCameraSettings.followAltitudeOffsetMeters ??
          CAMERA_SETTINGS_DEFAULTS.followAltitudeOffsetMeters,
        "cameraSettings.followAltitudeOffsetMeters",
      ),
      CAMERA_SETTINGS_FIELDS.followAltitudeOffsetMeters.min,
      CAMERA_SETTINGS_FIELDS.followAltitudeOffsetMeters.max,
    ),
    followPitchDegrees: clamp(
      normalizePositiveNumber(
        rawCameraSettings.followPitchDegrees ??
          CAMERA_SETTINGS_DEFAULTS.followPitchDegrees,
        "cameraSettings.followPitchDegrees",
      ),
      CAMERA_SETTINGS_FIELDS.followPitchDegrees.min,
      CAMERA_SETTINGS_FIELDS.followPitchDegrees.max,
    ),
    lookAheadDistanceMeters: clamp(
      normalizePositiveNumber(
        rawCameraSettings.lookAheadDistanceMeters ??
          CAMERA_SETTINGS_DEFAULTS.lookAheadDistanceMeters,
        "cameraSettings.lookAheadDistanceMeters",
      ),
      CAMERA_SETTINGS_FIELDS.lookAheadDistanceMeters.min,
      CAMERA_SETTINGS_FIELDS.lookAheadDistanceMeters.max,
    ),
    lookAheadPointWindow: clamp(
      normalizePositiveInteger(
        rawCameraSettings.lookAheadPointWindow ??
          CAMERA_SETTINGS_DEFAULTS.lookAheadPointWindow,
        "cameraSettings.lookAheadPointWindow",
      ),
      CAMERA_SETTINGS_FIELDS.lookAheadPointWindow.min,
      CAMERA_SETTINGS_FIELDS.lookAheadPointWindow.max,
    ),
    smoothingStrength: clamp(
      normalizePositiveNumber(
        rawCameraSettings.smoothingStrength ??
          CAMERA_SETTINGS_DEFAULTS.smoothingStrength,
        "cameraSettings.smoothingStrength",
      ),
      CAMERA_SETTINGS_FIELDS.smoothingStrength.min,
      CAMERA_SETTINGS_FIELDS.smoothingStrength.max,
    ),
    overviewPitchDegrees: clamp(
      normalizePositiveNumber(
        rawCameraSettings.overviewPitchDegrees ??
          CAMERA_SETTINGS_DEFAULTS.overviewPitchDegrees,
        "cameraSettings.overviewPitchDegrees",
      ),
      CAMERA_SETTINGS_FIELDS.overviewPitchDegrees.min,
      CAMERA_SETTINGS_FIELDS.overviewPitchDegrees.max,
    ),
    overviewRangeMultiplier: clamp(
      normalizePositiveNumber(
        rawCameraSettings.overviewRangeMultiplier ??
          CAMERA_SETTINGS_DEFAULTS.overviewRangeMultiplier,
        "cameraSettings.overviewRangeMultiplier",
      ),
      CAMERA_SETTINGS_FIELDS.overviewRangeMultiplier.min,
      CAMERA_SETTINGS_FIELDS.overviewRangeMultiplier.max,
    ),
  };
}

// F-69: normalize terrain settings centrally so export and renderer clamp exaggeration the same way.
function normalizeTerrainSettings(rawTerrainSettings = {}) {
  const normalizedRouteOffset = Number(
    rawTerrainSettings.routeOffsetMeters ?? TERRAIN_SETTINGS_DEFAULTS.routeOffsetMeters,
  );

  return {
    enabled:
      rawTerrainSettings.enabled === undefined
        ? TERRAIN_SETTINGS_DEFAULTS.enabled
        : Boolean(rawTerrainSettings.enabled),
    exaggeration: clamp(
      normalizePositiveNumber(
        rawTerrainSettings.exaggeration ?? TERRAIN_SETTINGS_DEFAULTS.exaggeration,
        "terrainSettings.exaggeration",
      ),
      TERRAIN_SETTINGS_FIELDS.exaggeration.min,
      TERRAIN_SETTINGS_FIELDS.exaggeration.max,
    ),
    routeOffsetMeters: clamp(
      Number.isFinite(normalizedRouteOffset)
        ? normalizedRouteOffset
        : TERRAIN_SETTINGS_DEFAULTS.routeOffsetMeters,
      TERRAIN_SETTINGS_FIELDS.routeOffsetMeters.min,
      TERRAIN_SETTINGS_FIELDS.routeOffsetMeters.max,
    ),
  };
}
// end F-69

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
  const fps = clampToFieldDefinition(
    normalizePositiveInteger(rawSettings.fps ?? EXPORT_DEFAULTS.fps, "fps"),
    EXPORT_SETTINGS_FIELDS.fps,
  );
  const timingMode = EXPORT_TIMING_MODES.some(
    (mode) => mode.id === rawSettings.timingMode,
  )
    ? rawSettings.timingMode
    : EXPORT_DEFAULTS.timingMode;
  const speedMultiplier = clampToFieldDefinition(
    normalizePositiveNumber(
      rawSettings.speedMultiplier ?? EXPORT_DEFAULTS.speedMultiplier,
      "speedMultiplier",
    ),
    EXPORT_SETTINGS_FIELDS.speedMultiplier,
  );
  const adaptiveStrength = clampToFieldDefinition(
    normalizePositiveNumber(
      rawSettings.adaptiveStrength ?? EXPORT_DEFAULTS.adaptiveStrength,
      "adaptiveStrength",
    ),
    EXPORT_SETTINGS_FIELDS.adaptiveStrength,
  );
  const settleTimeoutMs = clampToFieldDefinition(
    normalizePositiveInteger(
      rawSettings.settleTimeoutMs ?? EXPORT_DEFAULTS.settleTimeoutMs,
      "settleTimeoutMs",
    ),
    EXPORT_SETTINGS_FIELDS.settleTimeoutMs,
  );
  const settleStablePasses = clampToFieldDefinition(
    normalizePositiveInteger(
      rawSettings.settleStablePasses ?? EXPORT_DEFAULTS.settleStablePasses,
      "settleStablePasses",
    ),
    EXPORT_SETTINGS_FIELDS.settleStablePasses,
  );
  const maxFrameRetries = clampToFieldDefinition(
    normalizePositiveInteger(
      rawSettings.maxFrameRetries ?? EXPORT_DEFAULTS.maxFrameRetries,
      "maxFrameRetries",
    ),
    EXPORT_SETTINGS_FIELDS.maxFrameRetries,
  );
  const cameraMode = EXPORT_CAMERA_MODES.some(
    (mode) => mode.id === rawSettings.cameraMode,
  )
    ? rawSettings.cameraMode
    : EXPORT_DEFAULTS.cameraMode;
  const speedGaugeMaxKph = clampToFieldDefinition(
    normalizePositiveNumber(
      rawSettings.speedGaugeMaxKph ?? EXPORT_DEFAULTS.speedGaugeMaxKph,
      "speedGaugeMaxKph",
    ),
    EXPORT_SETTINGS_FIELDS.speedGaugeMaxKph,
  );
  const rawRangeStartTimestamp = Number(rawSettings.rangeStartTimestamp);
  const rawRangeEndTimestamp = Number(rawSettings.rangeEndTimestamp);

  return {
    resolutionId,
    width,
    height,
    fps,
    timingMode,
    speedMultiplier,
    adaptiveStrength,
    cameraMode,
    speedGaugeMaxKph,
    rangeStartTimestamp: Number.isFinite(rawRangeStartTimestamp)
      ? rawRangeStartTimestamp
      : null,
    rangeEndTimestamp: Number.isFinite(rawRangeEndTimestamp)
      ? rawRangeEndTimestamp
      : null,
    cameraSettings: normalizeCameraSettings(rawSettings.cameraSettings),
    // F-69: carry terrain settings through normalized export payloads so export mirrors preview terrain behavior.
    terrainSettings: normalizeTerrainSettings(rawSettings.terrainSettings),
    // end F-69
    settleTimeoutMs,
    settleStablePasses,
    maxFrameRetries,
    overlayVisibility: normalizeOverlayVisibilitySettings(
      rawSettings.overlayVisibility,
    ),
    ...normalizeMediaPresentationSettings(rawSettings),
  };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getGeodesicDistanceMeters(startTrackpoint, endTrackpoint) {
  if (
    !Number.isFinite(startTrackpoint?.latitude) ||
    !Number.isFinite(startTrackpoint?.longitude) ||
    !Number.isFinite(endTrackpoint?.latitude) ||
    !Number.isFinite(endTrackpoint?.longitude)
  ) {
    return 0;
  }

  const earthRadiusMeters = 6371000;
  const startLatitude = toRadians(startTrackpoint.latitude);
  const endLatitude = toRadians(endTrackpoint.latitude);
  const latitudeDelta = endLatitude - startLatitude;
  const longitudeDelta = toRadians(
    endTrackpoint.longitude - startTrackpoint.longitude,
  );
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * centralAngle;
}

function getSegmentDistanceMeters(startTrackpoint, endTrackpoint) {
  if (
    Number.isFinite(startTrackpoint?.distance) &&
    Number.isFinite(endTrackpoint?.distance)
  ) {
    return Math.max(0, endTrackpoint.distance - startTrackpoint.distance);
  }

  return getGeodesicDistanceMeters(startTrackpoint, endTrackpoint);
}

function getSegmentSpeedMetersPerSecond(
  startTrackpoint,
  endTrackpoint,
  activityDurationMs,
) {
  const sampledSpeeds = [startTrackpoint?.speed, endTrackpoint?.speed].filter(
    (speed) => Number.isFinite(speed) && speed >= 0,
  );

  if (sampledSpeeds.length === 2) {
    return (sampledSpeeds[0] + sampledSpeeds[1]) / 2;
  }

  if (sampledSpeeds.length === 1) {
    return sampledSpeeds[0];
  }

  const activityDurationSeconds = activityDurationMs / 1000;

  if (activityDurationSeconds <= 0) {
    return 0;
  }

  return getSegmentDistanceMeters(startTrackpoint, endTrackpoint) /
    activityDurationSeconds;
}

function getAdaptiveSegmentMultiplier(segmentSpeedMetersPerSecond, settings) {
  const baseMultiplier = settings.speedMultiplier;
  const strength = settings.adaptiveStrength;
  const idleSpeedThreshold = 0.75;
  const cruisingSpeedThreshold = 5;
  const fastSpeedThreshold = 12;
  const sprintSpeedThreshold = 20;
  const idleBoost = 1 + strength * 2.2;
  const fastReduction = clamp(1 - strength * 0.2, 0.5, 1);
  const sprintReduction = clamp(1 - strength * 0.35, 0.35, 1);

  if (segmentSpeedMetersPerSecond <= idleSpeedThreshold) {
    return baseMultiplier * idleBoost;
  }

  if (segmentSpeedMetersPerSecond < cruisingSpeedThreshold) {
    const ratio =
      (segmentSpeedMetersPerSecond - idleSpeedThreshold) /
      (cruisingSpeedThreshold - idleSpeedThreshold);

    return baseMultiplier * lerp(idleBoost, 1, ratio);
  }

  if (segmentSpeedMetersPerSecond < fastSpeedThreshold) {
    const ratio =
      (segmentSpeedMetersPerSecond - cruisingSpeedThreshold) /
      (fastSpeedThreshold - cruisingSpeedThreshold);

    return baseMultiplier * lerp(1, fastReduction, ratio);
  }

  const ratio = clamp(
    (segmentSpeedMetersPerSecond - fastSpeedThreshold) /
      (sprintSpeedThreshold - fastSpeedThreshold),
    0,
    1,
  );

  return baseMultiplier * lerp(fastReduction, sprintReduction, ratio);
}

function getTrackAverageSpeedMetersPerSecond(trackpoints) {
  if (!Array.isArray(trackpoints) || trackpoints.length < 2) {
    return 0;
  }

  const totalDistanceMeters = getSegmentDistanceMeters(
    trackpoints[0],
    trackpoints[trackpoints.length - 1],
  );
  const totalDurationSeconds =
    (trackpoints[trackpoints.length - 1].timestamp - trackpoints[0].timestamp) /
    1000;

  if (totalDurationSeconds <= 0 || totalDistanceMeters <= 0) {
    return 0;
  }

  return totalDistanceMeters / totalDurationSeconds;
}

function getSegmentVideoDurationMs(
  startTrackpoint,
  endTrackpoint,
  activityDurationMs,
  settings,
  fixedSpeedMetersPerSecond,
) {
  if (activityDurationMs <= 0) {
    return 0;
  }

  if (settings.timingMode === "fixed-speed") {
    const distanceMeters = getSegmentDistanceMeters(startTrackpoint, endTrackpoint);

    if (distanceMeters <= 0) {
      return 0;
    }

    return (distanceMeters / fixedSpeedMetersPerSecond) * 1000;
  }

  if (settings.timingMode === "adaptive-speed") {
    const segmentSpeedMetersPerSecond = getSegmentSpeedMetersPerSecond(
      startTrackpoint,
      endTrackpoint,
      activityDurationMs,
    );
    const adaptiveMultiplier = getAdaptiveSegmentMultiplier(
      segmentSpeedMetersPerSecond,
      settings,
    );

    return activityDurationMs / adaptiveMultiplier;
  }

  return activityDurationMs / settings.speedMultiplier;
}

function getTrackSegmentOverlap(segmentStart, segmentEnd, rangeStart, rangeEnd) {
  const overlapStart = Math.max(segmentStart, rangeStart);
  const overlapEnd = Math.min(segmentEnd, rangeEnd);

  if (overlapEnd <= overlapStart) {
    return null;
  }

  return {
    overlapDurationMs: overlapEnd - overlapStart,
    overlapEnd,
    overlapStart,
  };
}

function createMediaTimelineEntry(item, settings, endTimestamp) {
  const presentationTimeline = getMediaPresentationTimeline(item, settings);

  if (!presentationTimeline || !Number.isFinite(item.alignedActivityTimestamp)) {
    return null;
  }

  const effectiveTimestamp = clamp(
    item.alignedActivityTimestamp,
    0,
    endTimestamp,
  );

  if (item.mediaType === "video") {
    const clampedDurationMs = Math.min(
      presentationTimeline.activityAdvanceMs,
      Math.max(0, endTimestamp - effectiveTimestamp),
    );

    if (clampedDurationMs <= 0) {
      return null;
    }

    return {
      activityAdvanceMs: clampedDurationMs,
      alignedActivityTimestamp: effectiveTimestamp,
      enterDurationMs: Math.min(presentationTimeline.enterDurationMs, clampedDurationMs),
      exitDurationMs: Math.min(presentationTimeline.exitDurationMs, clampedDurationMs),
      holdDurationMs: Math.max(
        0,
        clampedDurationMs -
          Math.min(presentationTimeline.enterDurationMs, clampedDurationMs) -
          Math.min(presentationTimeline.exitDurationMs, clampedDurationMs),
      ),
      item,
      totalDurationMs: clampedDurationMs,
    };
  }

  return {
    ...presentationTimeline,
    alignedActivityTimestamp: effectiveTimestamp,
    item,
  };
}

function buildExportTimeline({ trackpoints, settings, mediaItems = [] }) {
  const normalizedSettings = normalizeExportSettings(settings);
  const safeTrackpoints = Array.isArray(trackpoints) ? trackpoints : [];

  if (safeTrackpoints.length === 0) {
    return {
      endTimestamp: 0,
      segments: [],
      settings: normalizedSettings,
      startTimestamp: 0,
      totalVideoDurationMs: 0,
    };
  }

  const fullStartTimestamp = safeTrackpoints[0].timestamp;
  const fullEndTimestamp = safeTrackpoints[safeTrackpoints.length - 1].timestamp;
  const startTimestamp = clamp(
    normalizedSettings.rangeStartTimestamp ?? fullStartTimestamp,
    fullStartTimestamp,
    fullEndTimestamp,
  );
  const endTimestamp = clamp(
    normalizedSettings.rangeEndTimestamp ?? fullEndTimestamp,
    startTimestamp,
    fullEndTimestamp,
  );
  const fixedSpeedMetersPerSecond = Math.max(
    1,
    getTrackAverageSpeedMetersPerSecond(safeTrackpoints) *
      normalizedSettings.speedMultiplier,
  );
  const sortedMediaItems = (Array.isArray(mediaItems) ? mediaItems : [])
    .filter((item) => Number.isFinite(item?.alignedActivityTimestamp))
    .filter((item) => {
      return (
        item.alignedActivityTimestamp >= startTimestamp &&
        item.alignedActivityTimestamp <= endTimestamp
      );
    })
    .sort(compareMediaPresentationItems)
    .map((item) => createMediaTimelineEntry(item, normalizedSettings, endTimestamp))
    .filter(Boolean);
  const segments = [];
  let totalVideoDurationMs = 0;

  const pushSegment = (segment) => {
    if (!segment || segment.videoDurationMs <= 0) {
      return;
    }

    segments.push({
      ...segment,
      videoEndMs: totalVideoDurationMs + segment.videoDurationMs,
      videoStartMs: totalVideoDurationMs,
    });
    totalVideoDurationMs += segment.videoDurationMs;
  };

  const addTrackSegmentsBetween = (rangeStart, rangeEnd) => {
    if (rangeEnd <= rangeStart) {
      return;
    }

    for (
      let trackpointIndex = 0;
      trackpointIndex < safeTrackpoints.length - 1;
      trackpointIndex += 1
    ) {
      const startTrackpoint = safeTrackpoints[trackpointIndex];
      const endTrackpoint = safeTrackpoints[trackpointIndex + 1];
      const overlap = getTrackSegmentOverlap(
        startTrackpoint.timestamp,
        endTrackpoint.timestamp,
        rangeStart,
        rangeEnd,
      );

      if (!overlap) {
        continue;
      }

      const fullActivityDurationMs = Math.max(
        0,
        endTrackpoint.timestamp - startTrackpoint.timestamp,
      );

      if (fullActivityDurationMs <= 0) {
        continue;
      }

      const fullVideoDurationMs = getSegmentVideoDurationMs(
        startTrackpoint,
        endTrackpoint,
        fullActivityDurationMs,
        normalizedSettings,
        fixedSpeedMetersPerSecond,
      );
      const videoDurationMs =
        fullVideoDurationMs * (overlap.overlapDurationMs / fullActivityDurationMs);

      pushSegment({
        activityDurationMs: overlap.overlapDurationMs,
        activityEndTimestamp: overlap.overlapEnd,
        activityStartTimestamp: overlap.overlapStart,
        kind: "track",
        mediaItemId: null,
        videoDurationMs,
      });
    }
  };

  let cursorTimestamp = startTimestamp;

  for (const mediaEntry of sortedMediaItems) {
    const mediaStartTimestamp = Math.max(
      cursorTimestamp,
      mediaEntry.alignedActivityTimestamp,
    );

    addTrackSegmentsBetween(cursorTimestamp, mediaStartTimestamp);

    if (mediaEntry.item.mediaType === "video") {
      const activityAdvanceMs = Math.min(
        mediaEntry.activityAdvanceMs,
        Math.max(0, endTimestamp - mediaStartTimestamp),
      );

      if (activityAdvanceMs <= 0) {
        cursorTimestamp = mediaStartTimestamp;
        continue;
      }

      pushSegment({
        activityDurationMs: activityAdvanceMs,
        activityEndTimestamp: mediaStartTimestamp + activityAdvanceMs,
        activityStartTimestamp: mediaStartTimestamp,
        enterDurationMs: mediaEntry.enterDurationMs,
        exitDurationMs: mediaEntry.exitDurationMs,
        holdDurationMs: mediaEntry.holdDurationMs,
        kind: "video",
        mediaItemId: mediaEntry.item.id,
        mediaItem: mediaEntry.item,
        videoDurationMs: activityAdvanceMs,
      });
      cursorTimestamp = mediaStartTimestamp + activityAdvanceMs;
      continue;
    }

    pushSegment({
      activityDurationMs: 0,
      activityEndTimestamp: mediaStartTimestamp,
      activityStartTimestamp: mediaStartTimestamp,
      enterDurationMs: mediaEntry.enterDurationMs,
      exitDurationMs: mediaEntry.exitDurationMs,
      holdDurationMs: mediaEntry.holdDurationMs,
      kind: "photo",
      mediaItemId: mediaEntry.item.id,
      mediaItem: mediaEntry.item,
      videoDurationMs: mediaEntry.totalDurationMs,
    });
    cursorTimestamp = mediaStartTimestamp;
  }

  addTrackSegmentsBetween(cursorTimestamp, endTimestamp);

  return {
    endTimestamp,
    segments,
    settings: normalizedSettings,
    startTimestamp,
    totalVideoDurationMs,
  };
}

function computeExportFrameCount({
  endTimestamp,
  exportTimeline,
  fps,
  speedMultiplier,
  startTimestamp,
}) {
  const videoDurationMs = exportTimeline
    ? exportTimeline.totalVideoDurationMs
    : Math.max(0, endTimestamp - startTimestamp) / speedMultiplier;

  if (videoDurationMs === 0) {
    return 1;
  }

  return Math.max(1, Math.ceil((videoDurationMs / 1000) * fps) + 1);
}

function findTimelineSegment(exportTimeline, videoTimeMs) {
  if (!exportTimeline || exportTimeline.segments.length === 0) {
    return null;
  }

  let low = 0;
  let high = exportTimeline.segments.length - 1;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);

    if (videoTimeMs < exportTimeline.segments[middle].videoEndMs) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return exportTimeline.segments[low];
}

function getExportFrameState({
  endTimestamp,
  exportTimeline,
  frameIndex,
  fps,
  speedMultiplier,
  startTimestamp,
}) {
  if (!exportTimeline) {
    const videoTimeSeconds = frameIndex / fps;
    const activityTimestamp =
      startTimestamp + videoTimeSeconds * speedMultiplier * 1000;

    return {
      activeMedia: null,
      activityTimestamp: Math.min(
        endTimestamp,
        Math.max(startTimestamp, activityTimestamp),
      ),
      videoTimeMs: videoTimeSeconds * 1000,
    };
  }

  if (exportTimeline.segments.length === 0) {
    return {
      activeMedia: null,
      activityTimestamp: exportTimeline.startTimestamp,
      videoTimeMs: 0,
    };
  }

  const videoTimeMs = Math.min(
    exportTimeline.totalVideoDurationMs,
    Math.max(0, (frameIndex / fps) * 1000),
  );

  if (videoTimeMs <= 0) {
    return {
      activeMedia: null,
      activityTimestamp: exportTimeline.startTimestamp,
      videoTimeMs: 0,
    };
  }

  if (videoTimeMs >= exportTimeline.totalVideoDurationMs) {
    return {
      activeMedia: null,
      activityTimestamp: exportTimeline.endTimestamp,
      videoTimeMs: exportTimeline.totalVideoDurationMs,
    };
  }

  const segment = findTimelineSegment(exportTimeline, videoTimeMs);

  if (!segment) {
    return {
      activeMedia: null,
      activityTimestamp: exportTimeline.endTimestamp,
      videoTimeMs,
    };
  }

  const localVideoTimeMs = clamp(
    videoTimeMs - segment.videoStartMs,
    0,
    segment.videoDurationMs,
  );

  if (segment.kind === "track") {
    const segmentRatio =
      segment.videoDurationMs > 0 ? localVideoTimeMs / segment.videoDurationMs : 0;

    return {
      activeMedia: null,
      activityTimestamp: Math.min(
        exportTimeline.endTimestamp,
        Math.max(
          exportTimeline.startTimestamp,
          segment.activityStartTimestamp +
            segment.activityDurationMs * clamp(segmentRatio, 0, 1),
        ),
      ),
      videoTimeMs,
    };
  }

  const mediaPresentation = buildMediaPresentationState(
    segment.mediaItem,
    localVideoTimeMs,
    exportTimeline.settings,
  );
  const activityTimestamp =
    segment.kind === "video"
      ? Math.min(
          exportTimeline.endTimestamp,
          segment.activityStartTimestamp + localVideoTimeMs,
        )
      : segment.activityStartTimestamp;

  return {
    activeMedia: mediaPresentation
      ? {
          ...mediaPresentation,
          itemId: segment.mediaItemId,
          mediaType: segment.mediaItem?.mediaType || "image",
        }
      : null,
    activityTimestamp,
    videoTimeMs,
  };
}

function getExportActivityTimestamp(options) {
  return getExportFrameState(options).activityTimestamp;
}

function formatFrameFileName(frameNumber) {
  return `frame-${String(frameNumber).padStart(6, "0")}.png`;
}

module.exports = {
  CAMERA_SETTINGS_FIELDS,
  // F-69: export terrain metadata/helpers so preload and renderer can share the same terrain model.
  TERRAIN_SETTINGS_FIELDS,
  normalizeTerrainSettings,
  // end F-69
  EXPORT_CAMERA_MODES,
  EXPORT_DEFAULTS,
  EXPORT_RESOLUTION_PRESETS,
  EXPORT_SETTINGS_FIELDS,
  EXPORT_TIMING_MODES,
  buildExportTimeline,
  computeExportFrameCount,
  formatFrameFileName,
  getExportActivityTimestamp,
  getExportFrameState,
  normalizeExportSettings,
};
