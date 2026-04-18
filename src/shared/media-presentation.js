const {
  MEDIA_PRESENTATION_DEFAULTS,
  MEDIA_PRESENTATION_SETTINGS_FIELDS,
} = require("./parameter-config");

// F-76: animation effects registry.
// Each entry describes the positional transforms applied during enter/exit phases.
// Opacity is always faded regardless of effect.
const MEDIA_ANIMATION_EFFECTS = Object.freeze({
  "slide-up": {
    label: "Slide up",
    enter: (p) => ({ translateY: 18 * (1 - p), translateX: 0, scale: lerp(0.94, 1, p) }),
    exit: (p) => ({ translateY: -10 * p, translateX: 0, scale: lerp(1, 1.03, p) }),
  },
  "fade": {
    label: "Fade only",
    enter: () => ({ translateY: 0, translateX: 0, scale: 1 }),
    exit: () => ({ translateY: 0, translateX: 0, scale: 1 }),
  },
  "slide-down": {
    label: "Slide down",
    enter: (p) => ({ translateY: -18 * (1 - p), translateX: 0, scale: lerp(0.94, 1, p) }),
    exit: (p) => ({ translateY: 10 * p, translateX: 0, scale: lerp(1, 1.03, p) }),
  },
  "slide-left": {
    label: "Slide from right",
    enter: (p) => ({ translateY: 0, translateX: 24 * (1 - p), scale: 1 }),
    exit: (p) => ({ translateY: 0, translateX: -18 * p, scale: 1 }),
  },
  "zoom": {
    label: "Zoom",
    enter: (p) => ({ translateY: 0, translateX: 0, scale: lerp(0.85, 1, p) }),
    exit: (p) => ({ translateY: 0, translateX: 0, scale: lerp(1, 1.1, p) }),
  },
  "none": {
    label: "None (fade only)",
    enter: () => ({ translateY: 0, translateX: 0, scale: 1 }),
    exit: () => ({ translateY: 0, translateX: 0, scale: 1 }),
  },
});

const MEDIA_IMAGE_FIT_OPTIONS = Object.freeze({
  contain: "contain",
  cover: "cover",
});
// end F-76

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

function clampToFieldDefinition(value, definition) {
  return clamp(
    value,
    definition?.min ?? Number.NEGATIVE_INFINITY,
    definition?.max ?? Number.POSITIVE_INFINITY,
  );
}

function normalizeMediaPresentationSettings(rawSettings = {}) {
  // F-76: validate animationEffect and imageFit.
  const rawEffect = rawSettings.animationEffect ?? MEDIA_PRESENTATION_DEFAULTS.animationEffect;
  const animationEffect = Object.prototype.hasOwnProperty.call(MEDIA_ANIMATION_EFFECTS, rawEffect)
    ? rawEffect
    : MEDIA_PRESENTATION_DEFAULTS.animationEffect;

  const rawFit = rawSettings.imageFit ?? MEDIA_PRESENTATION_DEFAULTS.imageFit;
  const imageFit = Object.prototype.hasOwnProperty.call(MEDIA_IMAGE_FIT_OPTIONS, rawFit)
    ? rawFit
    : MEDIA_PRESENTATION_DEFAULTS.imageFit;
  // end F-76

  return {
    photoDisplayDurationMs: clampToFieldDefinition(
      normalizePositiveInteger(
        rawSettings.photoDisplayDurationMs ??
          MEDIA_PRESENTATION_DEFAULTS.photoDisplayDurationMs,
        "photoDisplayDurationMs",
      ),
      MEDIA_PRESENTATION_SETTINGS_FIELDS.photoDisplayDurationMs,
    ),
    enterDurationMs: clampToFieldDefinition(
      normalizePositiveInteger(
        rawSettings.enterDurationMs ?? MEDIA_PRESENTATION_DEFAULTS.enterDurationMs,
        "enterDurationMs",
      ),
      MEDIA_PRESENTATION_SETTINGS_FIELDS.enterDurationMs,
    ),
    exitDurationMs: clampToFieldDefinition(
      normalizePositiveInteger(
        rawSettings.exitDurationMs ?? MEDIA_PRESENTATION_DEFAULTS.exitDurationMs,
        "exitDurationMs",
      ),
      MEDIA_PRESENTATION_SETTINGS_FIELDS.exitDurationMs,
    ),
    photoKenBurnsEnabled:
      rawSettings.photoKenBurnsEnabled === undefined
        ? MEDIA_PRESENTATION_DEFAULTS.photoKenBurnsEnabled
        : Boolean(rawSettings.photoKenBurnsEnabled),
    photoKenBurnsScale: clamp(
      MEDIA_PRESENTATION_DEFAULTS.photoKenBurnsScale,
      MEDIA_PRESENTATION_SETTINGS_FIELDS.photoKenBurnsScale.min ?? 0,
      MEDIA_PRESENTATION_SETTINGS_FIELDS.photoKenBurnsScale.max ?? Number.POSITIVE_INFINITY,
    ),
    // F-76
    animationEffect,
    imageFit,
    // end F-76
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
  let translateX = 0;
  let scale = 1;

  // F-76: apply the chosen animation effect.
  const effectId = settings?.animationEffect ?? MEDIA_PRESENTATION_DEFAULTS.animationEffect;
  const effect = MEDIA_ANIMATION_EFFECTS[effectId] ?? MEDIA_ANIMATION_EFFECTS["slide-up"];

  if (timeline.enterDurationMs > 0 && safeElapsedMs < enterEndMs) {
    const enterProgress = safeElapsedMs / timeline.enterDurationMs;
    const transforms = effect.enter(enterProgress);

    opacity = enterProgress;
    translateY = transforms.translateY;
    translateX = transforms.translateX;
    scale = transforms.scale;
  } else if (timeline.exitDurationMs > 0 && safeElapsedMs > exitStartMs) {
    const exitProgress = clamp(
      (safeElapsedMs - exitStartMs) / timeline.exitDurationMs,
      0,
      1,
    );
    const transforms = effect.exit(exitProgress);

    opacity = 1 - exitProgress;
    translateY = transforms.translateY;
    translateX = transforms.translateX;
    scale = transforms.scale;
  }
  // end F-76

  const progressRatio =
    timeline.totalDurationMs > 0 ? safeElapsedMs / timeline.totalDurationMs : 1;
  const imageScale =
    item.mediaType === "image" && settings.photoKenBurnsEnabled
      ? 1 + settings.photoKenBurnsScale * progressRatio
      : 1;

  return {
    elapsedMs: safeElapsedMs,
    // F-76: include imageFit and translateX in result so the renderer doesn't need settings.
    imageFit: settings?.imageFit ?? MEDIA_PRESENTATION_DEFAULTS.imageFit,
    imageScale,
    opacity,
    progressRatio,
    scale,
    totalDurationMs: timeline.totalDurationMs,
    translateX,
    translateY,
    // end F-76
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
  // F-76
  MEDIA_ANIMATION_EFFECTS,
  MEDIA_IMAGE_FIT_OPTIONS,
  // end F-76
  MEDIA_PRESENTATION_DEFAULTS,
  buildMediaPresentationState,
  compareMediaPresentationItems,
  getActiveMediaPresentation,
  getMediaDurationMs,
  getMediaPresentationTimeline,
  getMediaPresentationWindow,
  normalizeMediaPresentationSettings,
};
