const MEDIA_ALIGNMENT_OFFSET_FIELDS = Object.freeze({
  globalOffsetSeconds: {
    type: "number",
    default: 0,
    min: -86400,
    max: 86400,
    step: 1,
  },
  deviceClockOffsetSeconds: {
    type: "number",
    default: 0,
    min: -86400,
    max: 86400,
    step: 1,
  },
});

const MEDIA_ALIGNMENT_OFFSET_DEFAULTS = Object.freeze({
  globalOffsetSeconds: MEDIA_ALIGNMENT_OFFSET_FIELDS.globalOffsetSeconds.default,
  deviceClockOffsetSeconds:
    MEDIA_ALIGNMENT_OFFSET_FIELDS.deviceClockOffsetSeconds.default,
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// F-21: centralize media drift offsets so preview and export reuse one corrected timestamp model.
function normalizeMediaAlignmentOffsets(rawOffsets = {}) {
  return Object.fromEntries(
    Object.entries(MEDIA_ALIGNMENT_OFFSET_FIELDS).map(([key, definition]) => {
      const parsed = Number(rawOffsets?.[key]);
      const fallback = MEDIA_ALIGNMENT_OFFSET_DEFAULTS[key];

      return [
        key,
        clamp(
          Number.isFinite(parsed) ? parsed : fallback,
          definition.min,
          definition.max,
        ),
      ];
    }),
  );
}

function getMediaAlignmentOffsetMs(rawOffsets = {}) {
  const normalizedOffsets = normalizeMediaAlignmentOffsets(rawOffsets);
  return Math.round(
    (normalizedOffsets.globalOffsetSeconds +
      normalizedOffsets.deviceClockOffsetSeconds) *
      1000,
  );
}

function applyMediaAlignmentOffsets(item, rawOffsets = {}) {
  const normalizedOffsets = normalizeMediaAlignmentOffsets(rawOffsets);
  const appliedAlignmentOffsetMs = getMediaAlignmentOffsetMs(normalizedOffsets);
  const adjustedCapturedAtTimestamp = Number.isFinite(item?.capturedAtTimestamp)
    ? item.capturedAtTimestamp + appliedAlignmentOffsetMs
    : null;

  return {
    ...item,
    adjustedCapturedAt: Number.isFinite(adjustedCapturedAtTimestamp)
      ? new Date(adjustedCapturedAtTimestamp).toISOString()
      : null,
    adjustedCapturedAtTimestamp,
    alignmentOffsets: normalizedOffsets,
    appliedAlignmentOffsetMs,
  };
}
// end F-21

function findNearestTrackIndex(trackpoints, timestamp) {
  if (trackpoints.length === 0) {
    return null;
  }

  let low = 0;
  let high = trackpoints.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const middleTimestamp = trackpoints[middle].timestamp;

    if (middleTimestamp === timestamp) {
      return middle;
    }

    if (middleTimestamp < timestamp) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (low >= trackpoints.length) {
    return trackpoints.length - 1;
  }

  if (high < 0) {
    return 0;
  }

  return Math.abs(trackpoints[low].timestamp - timestamp) <
    Math.abs(trackpoints[high].timestamp - timestamp)
    ? low
    : high;
}

function alignMediaItemToTrack(item, trackpoints, rawOffsets = {}) {
  const adjustedItem = applyMediaAlignmentOffsets(item, rawOffsets);

  if (
    !Number.isFinite(adjustedItem.adjustedCapturedAtTimestamp) ||
    trackpoints.length === 0
  ) {
    return {
      ...adjustedItem,
      alignmentStatus: "missing-timestamp",
      alignedActivityTimestamp: null,
      alignedActivityTime: null,
      nearestTrackIndex: null,
    };
  }

  const startTimestamp = trackpoints[0].timestamp;
  const endTimestamp = trackpoints[trackpoints.length - 1].timestamp;

  if (adjustedItem.adjustedCapturedAtTimestamp < startTimestamp) {
    return {
      ...adjustedItem,
      alignmentStatus: "before-start",
      alignedActivityTimestamp: startTimestamp,
      alignedActivityTime: new Date(startTimestamp).toISOString(),
      nearestTrackIndex: 0,
    };
  }

  if (adjustedItem.adjustedCapturedAtTimestamp > endTimestamp) {
    return {
      ...adjustedItem,
      alignmentStatus: "after-end",
      alignedActivityTimestamp: endTimestamp,
      alignedActivityTime: new Date(endTimestamp).toISOString(),
      nearestTrackIndex: trackpoints.length - 1,
    };
  }

  return {
    ...adjustedItem,
    alignmentStatus: "aligned",
    alignedActivityTimestamp: adjustedItem.adjustedCapturedAtTimestamp,
    alignedActivityTime: new Date(
      adjustedItem.adjustedCapturedAtTimestamp,
    ).toISOString(),
    nearestTrackIndex: findNearestTrackIndex(
      trackpoints,
      adjustedItem.adjustedCapturedAtTimestamp,
    ),
  };
}

function compareAlignedMedia(left, right) {
  const leftTimestamp = Number.isFinite(left.alignedActivityTimestamp)
    ? left.alignedActivityTimestamp
    : Number.POSITIVE_INFINITY;
  const rightTimestamp = Number.isFinite(right.alignedActivityTimestamp)
    ? right.alignedActivityTimestamp
    : Number.POSITIVE_INFINITY;

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return left.fileName.localeCompare(right.fileName);
}

function alignMediaItemsToTrack(mediaItems, trackpoints, rawOffsets = {}) {
  return mediaItems
    .map((item) => alignMediaItemToTrack(item, trackpoints, rawOffsets))
    .sort(compareAlignedMedia);
}

module.exports = {
  MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
  MEDIA_ALIGNMENT_OFFSET_FIELDS,
  applyMediaAlignmentOffsets,
  alignMediaItemsToTrack,
  alignMediaItemToTrack,
  findNearestTrackIndex,
  getMediaAlignmentOffsetMs,
  normalizeMediaAlignmentOffsets,
};
