const MEDIA_PRESENTATION_DEFAULTS = {
  photoDisplayDurationMs: 5000,
  enterDurationMs: 500,
  exitDurationMs: 700,
  photoKenBurnsEnabled: true,
  photoKenBurnsScale: 0.05,
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(start, end, ratio) {
  return start + (end - start) * ratio;
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Media setting "${fieldName}" must be a positive integer.`);
  }

  return parsed;
}

function normalizeMediaPresentationSettings(rawSettings = {}) {
  return {
    photoDisplayDurationMs: normalizePositiveInteger(
      rawSettings.photoDisplayDurationMs ??
        MEDIA_PRESENTATION_DEFAULTS.photoDisplayDurationMs,
      "photoDisplayDurationMs",
    ),
    enterDurationMs: normalizePositiveInteger(
      rawSettings.enterDurationMs ?? MEDIA_PRESENTATION_DEFAULTS.enterDurationMs,
      "enterDurationMs",
    ),
    exitDurationMs: normalizePositiveInteger(
      rawSettings.exitDurationMs ?? MEDIA_PRESENTATION_DEFAULTS.exitDurationMs,
      "exitDurationMs",
    ),
    photoKenBurnsEnabled:
      rawSettings.photoKenBurnsEnabled === undefined
        ? MEDIA_PRESENTATION_DEFAULTS.photoKenBurnsEnabled
        : Boolean(rawSettings.photoKenBurnsEnabled),
    photoKenBurnsScale: MEDIA_PRESENTATION_DEFAULTS.photoKenBurnsScale,
  };
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
      activityAdvanceMs: durationMs,
      enterDurationMs,
      exitDurationMs,
      holdDurationMs: Math.max(0, durationMs - enterDurationMs - exitDurationMs),
      totalDurationMs: durationMs,
    };
  }

  return {
    activityAdvanceMs: 0,
    enterDurationMs: settings.enterDurationMs,
    exitDurationMs: settings.exitDurationMs,
    holdDurationMs: settings.photoDisplayDurationMs,
    totalDurationMs:
      settings.enterDurationMs +
      settings.photoDisplayDurationMs +
      settings.exitDurationMs,
  };
}

function getMediaPresentationWindow(item, settings) {
  const timeline = getMediaPresentationTimeline(item, settings);

  if (!timeline) {
    return null;
  }

  return {
    ...timeline,
    endTimestamp: item.alignedActivityTimestamp + timeline.totalDurationMs,
    startTimestamp: item.alignedActivityTimestamp,
  };
}

function buildMediaPresentationState(item, elapsedMs, settings) {
  const timeline = getMediaPresentationTimeline(item, settings);

  if (!timeline) {
    return null;
  }

  const safeElapsedMs = clamp(elapsedMs, 0, timeline.totalDurationMs);
  const enterEndMs = timeline.enterDurationMs;
  const exitStartMs = Math.max(
    timeline.enterDurationMs + timeline.holdDurationMs,
    timeline.totalDurationMs - timeline.exitDurationMs,
  );
  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (timeline.enterDurationMs > 0 && safeElapsedMs < enterEndMs) {
    const enterProgress = safeElapsedMs / timeline.enterDurationMs;

    opacity = enterProgress;
    translateY = 18 * (1 - enterProgress);
    scale = lerp(0.94, 1, enterProgress);
  } else if (timeline.exitDurationMs > 0 && safeElapsedMs > exitStartMs) {
    const exitProgress = clamp(
      (safeElapsedMs - exitStartMs) / timeline.exitDurationMs,
      0,
      1,
    );

    opacity = 1 - exitProgress;
    translateY = -10 * exitProgress;
    scale = lerp(1, 1.03, exitProgress);
  }

  const progressRatio =
    timeline.totalDurationMs > 0 ? safeElapsedMs / timeline.totalDurationMs : 1;
  const imageScale =
    item.mediaType === "image" && settings.photoKenBurnsEnabled
      ? 1 + settings.photoKenBurnsScale * progressRatio
      : 1;

  return {
    elapsedMs: safeElapsedMs,
    imageScale,
    opacity,
    progressRatio,
    scale,
    totalDurationMs: timeline.totalDurationMs,
    translateY,
    videoCurrentTimeMs:
      item.mediaType === "video"
        ? clamp(safeElapsedMs, 0, getMediaDurationMs(item))
        : 0,
  };
}

function compareMediaPresentationItems(left, right) {
  const leftTimestamp = Number.isFinite(left?.alignedActivityTimestamp)
    ? left.alignedActivityTimestamp
    : Number.POSITIVE_INFINITY;
  const rightTimestamp = Number.isFinite(right?.alignedActivityTimestamp)
    ? right.alignedActivityTimestamp
    : Number.POSITIVE_INFINITY;

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return String(left?.fileName || "").localeCompare(String(right?.fileName || ""));
}

function getActiveMediaPresentation({
  mediaItems,
  playbackTimestamp,
  settings,
}) {
  const safeItems = Array.isArray(mediaItems) ? mediaItems : [];
  let bestMatch = null;

  for (const item of safeItems) {
    const window = getMediaPresentationWindow(item, settings);

    if (
      !window ||
      playbackTimestamp < window.startTimestamp ||
      playbackTimestamp > window.endTimestamp
    ) {
      continue;
    }

    if (
      !bestMatch ||
      window.startTimestamp > bestMatch.window.startTimestamp ||
      (window.startTimestamp === bestMatch.window.startTimestamp &&
        compareMediaPresentationItems(item, bestMatch.item) < 0)
    ) {
      bestMatch = {
        item,
        window,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    item: bestMatch.item,
    presentationStartTimestamp: bestMatch.window.startTimestamp,
    ...buildMediaPresentationState(
      bestMatch.item,
      playbackTimestamp - bestMatch.window.startTimestamp,
      settings,
    ),
  };
}

module.exports = {
  MEDIA_PRESENTATION_DEFAULTS,
  buildMediaPresentationState,
  compareMediaPresentationItems,
  getActiveMediaPresentation,
  getMediaDurationMs,
  getMediaPresentationTimeline,
  getMediaPresentationWindow,
  normalizeMediaPresentationSettings,
};
