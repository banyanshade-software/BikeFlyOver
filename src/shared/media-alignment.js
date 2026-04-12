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

function alignMediaItemToTrack(item, trackpoints) {
  if (!Number.isFinite(item.capturedAtTimestamp) || trackpoints.length === 0) {
    return {
      ...item,
      alignmentStatus: "missing-timestamp",
      alignedActivityTimestamp: null,
      alignedActivityTime: null,
      nearestTrackIndex: null,
    };
  }

  const startTimestamp = trackpoints[0].timestamp;
  const endTimestamp = trackpoints[trackpoints.length - 1].timestamp;

  if (item.capturedAtTimestamp < startTimestamp) {
    return {
      ...item,
      alignmentStatus: "before-start",
      alignedActivityTimestamp: startTimestamp,
      alignedActivityTime: new Date(startTimestamp).toISOString(),
      nearestTrackIndex: 0,
    };
  }

  if (item.capturedAtTimestamp > endTimestamp) {
    return {
      ...item,
      alignmentStatus: "after-end",
      alignedActivityTimestamp: endTimestamp,
      alignedActivityTime: new Date(endTimestamp).toISOString(),
      nearestTrackIndex: trackpoints.length - 1,
    };
  }

  return {
    ...item,
    alignmentStatus: "aligned",
    alignedActivityTimestamp: item.capturedAtTimestamp,
    alignedActivityTime: new Date(item.capturedAtTimestamp).toISOString(),
    nearestTrackIndex: findNearestTrackIndex(trackpoints, item.capturedAtTimestamp),
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

function alignMediaItemsToTrack(mediaItems, trackpoints) {
  return mediaItems
    .map((item) => alignMediaItemToTrack(item, trackpoints))
    .sort(compareAlignedMedia);
}

module.exports = {
  alignMediaItemsToTrack,
  alignMediaItemToTrack,
  findNearestTrackIndex,
};
