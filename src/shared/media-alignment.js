const MEDIA_ALIGNMENT_OFFSET_FIELDS = Object.freeze({
  offsetSeconds: Object.freeze({
    type: "number",
    default: 0,
    min: -86400,
    max: 86400,
    step: 1,
  }),
});

const MEDIA_ALIGNMENT_OFFSET_DEFAULTS = Object.freeze({
  cameraOffsetsByCameraId: Object.freeze({}),
  mediaOffsetsByMediaId: Object.freeze({}),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// F-21: normalize per-camera and per-media offsets in one shared place so preview/export apply the same correction precedence.
function normalizeMediaAlignmentOffsetValue(value) {
  const parsed = Number(value);
  const definition = MEDIA_ALIGNMENT_OFFSET_FIELDS.offsetSeconds;

  return clamp(
    Number.isFinite(parsed) ? parsed : definition.default,
    definition.min,
    definition.max,
  );
}

function normalizeOffsetMap(rawOffsetMap = {}) {
  return Object.fromEntries(
    Object.entries(rawOffsetMap).flatMap(([key, value]) => {
      if (typeof key !== "string" || key.length === 0) {
        return [];
      }

      return [[key, normalizeMediaAlignmentOffsetValue(value)]];
    }),
  );
}

function normalizeMediaAlignmentOffsets(rawOffsets = {}) {
  return {
    cameraOffsetsByCameraId: normalizeOffsetMap(rawOffsets.cameraOffsetsByCameraId),
    mediaOffsetsByMediaId: normalizeOffsetMap(rawOffsets.mediaOffsetsByMediaId),
  };
}

function getMediaAlignmentOffsetForItem(item, rawOffsets = {}) {
  const normalizedOffsets = normalizeMediaAlignmentOffsets(rawOffsets);
  const mediaId =
    typeof item?.id === "string" && item.id.length > 0 ? item.id : null;
  const cameraIdentityId =
    typeof item?.cameraIdentityId === "string" && item.cameraIdentityId.length > 0
      ? item.cameraIdentityId
      : null;

  if (
    mediaId &&
    Number.isFinite(normalizedOffsets.mediaOffsetsByMediaId[mediaId]) &&
    normalizedOffsets.mediaOffsetsByMediaId[mediaId] !== 0
  ) {
    return {
      offsetSeconds: normalizedOffsets.mediaOffsetsByMediaId[mediaId],
      source: "media",
    };
  }

  if (
    cameraIdentityId &&
    Number.isFinite(normalizedOffsets.cameraOffsetsByCameraId[cameraIdentityId]) &&
    normalizedOffsets.cameraOffsetsByCameraId[cameraIdentityId] !== 0
  ) {
    return {
      offsetSeconds: normalizedOffsets.cameraOffsetsByCameraId[cameraIdentityId],
      source: "camera",
    };
  }

  return {
    offsetSeconds: 0,
    source: "none",
  };
}

function getMediaAlignmentOffsetMs(item, rawOffsets = {}) {
  return Math.round(
    getMediaAlignmentOffsetForItem(item, rawOffsets).offsetSeconds * 1000,
  );
}

function applyMediaAlignmentOffsets(item, rawOffsets = {}) {
  const normalizedOffsets = normalizeMediaAlignmentOffsets(rawOffsets);
  const { offsetSeconds, source } = getMediaAlignmentOffsetForItem(
    item,
    normalizedOffsets,
  );
  const appliedAlignmentOffsetMs = Math.round(offsetSeconds * 1000);
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
    appliedAlignmentOffsetSeconds: offsetSeconds,
    appliedAlignmentOffsetSource: source,
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
  getMediaAlignmentOffsetForItem,
  getMediaAlignmentOffsetMs,
  normalizeMediaAlignmentOffsetValue,
  normalizeMediaAlignmentOffsets,
};
