const EXPORT_OPTIONS = window.bikeFlyOverApp?.getExportOptions?.() || {
  defaults: {
    resolutionId: "landscape-720p",
    width: 1280,
    height: 720,
    fps: 30,
    timingMode: "adaptive-speed",
    speedMultiplier: 40,
    adaptiveStrength: 1,
    cameraMode: "follow",
    settleTimeoutMs: 15000,
    settleStablePasses: 2,
    maxFrameRetries: 1,
    photoDisplayDurationMs: 5000,
    photoKenBurnsEnabled: true,
    enterDurationMs: 500,
    exitDurationMs: 700,
  },
  resolutionPresets: [],
  cameraModes: [],
  timingModes: [],
};
const RENDER_MODE =
  new URLSearchParams(window.location.search).get("mode") === "export"
    ? "export"
    : "preview";

const exportUiState = {
  isExporting: false,
};

const mediaLibraryState = {
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

function progressRatioToTimestamp(playbackState, progressRatio) {
  if (playbackState.durationMs <= 0) {
    return playbackState.startTimestamp;
  }

  return (
    playbackState.startTimestamp +
    playbackState.durationMs * clampProgressRatio(progressRatio)
  );
}

function sliderValueToTimestamp(playbackState, sliderValue) {
  return progressRatioToTimestamp(
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
  const parsedPhotoDisplaySeconds =
    photoDisplayDurationInput instanceof HTMLInputElement
      ? Number(photoDisplayDurationInput.value)
      : Number.NaN;

  return {
    enterDurationMs: EXPORT_OPTIONS.defaults.enterDurationMs ?? 500,
    exitDurationMs: EXPORT_OPTIONS.defaults.exitDurationMs ?? 700,
    photoDisplayDurationMs: Number.isFinite(parsedPhotoDisplaySeconds)
      ? Math.max(1000, Math.round(parsedPhotoDisplaySeconds * 1000))
      : EXPORT_OPTIONS.defaults.photoDisplayDurationMs ?? 5000,
    photoKenBurnsEnabled:
      photoKenBurnsCheckbox instanceof HTMLInputElement
        ? photoKenBurnsCheckbox.checked
        : EXPORT_OPTIONS.defaults.photoKenBurnsEnabled ?? true,
    photoKenBurnsScale: 0.05,
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
  let scale = 1;

  if (timeline.enterDurationMs > 0 && safeElapsedMs < timeline.enterDurationMs) {
    const enterProgress = safeElapsedMs / timeline.enterDurationMs;

    opacity = enterProgress;
    translateY = 18 * (1 - enterProgress);
    scale = 0.94 + 0.06 * enterProgress;
  } else if (timeline.exitDurationMs > 0 && safeElapsedMs > exitStartMs) {
    const exitProgress = Math.min(
      1,
      (safeElapsedMs - exitStartMs) / timeline.exitDurationMs,
    );

    opacity = 1 - exitProgress;
    translateY = -10 * exitProgress;
    scale = 1 + 0.03 * exitProgress;
  }

  const progressRatio =
    timeline.totalDurationMs > 0 ? safeElapsedMs / timeline.totalDurationMs : 1;

  return {
    elapsedMs: safeElapsedMs,
    imageScale:
      item.mediaType === "image" && settings.photoKenBurnsEnabled
        ? 1 + settings.photoKenBurnsScale * progressRatio
        : 1,
    opacity,
    scale,
    totalDurationMs: timeline.totalDurationMs,
    translateY,
    videoCurrentTimeMs:
      item.mediaType === "video"
        ? Math.min(safeElapsedMs, getMediaDurationMs(item))
        : 0,
  };
}

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

  if (RENDER_MODE !== "preview") {
    hideMediaPreviewOverlay();
    return;
  }

  const hasExportPresentation = Object.prototype.hasOwnProperty.call(
    options,
    "exportActiveMedia",
  );
  const presentation = hasExportPresentation
    ? options.exportActiveMedia && Number.isFinite(options.exportActiveMedia.elapsedMs)
      ? {
          item: mediaLibraryState.items.find((item) => {
            return item.id === options.exportActiveMedia.itemId;
          }),
          ...options.exportActiveMedia,
        }
      : null
    : getActivePreviewMediaPresentation(playbackState.currentTimestamp);

  if (!presentation || !presentation.item) {
    hideMediaPreviewOverlay();
    return;
  }

  const { item: activeItem, imageScale, opacity, scale, translateY } = presentation;

  cardElement.style.opacity = String(opacity);
  cardElement.style.transform = `translateY(${translateY}px) scale(${scale})`;
  imageElement.style.transform = `scale(${imageScale})`;
  videoElement.style.transform = `scale(${imageScale})`;

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
  } else {
    setTextContent(
      "mediaPreviewTime",
      activeItem.alignedActivityTime
        ? `Aligned at ${formatTimestamp(activeItem.alignedActivityTime)}`
        : "Aligned media preview",
    );
  }

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
  const startTimestamp = trackpoints[0].timestamp;
  const endTimestamp = trackpoints[trackpoints.length - 1].timestamp;

  return {
    trackpoints,
    startTimestamp,
    endTimestamp,
    durationMs: endTimestamp - startTimestamp,
    currentTimestamp: startTimestamp,
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
    camera: {
      mode: options.cameraMode ?? EXPORT_OPTIONS.defaults.cameraMode,
      adaptiveStrength:
        options.adaptiveStrength ?? EXPORT_OPTIONS.defaults.adaptiveStrength,
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

function alignMediaItemsToTrack(mediaItems, trackpoints) {
  const startTimestamp = trackpoints[0].timestamp;
  const endTimestamp = trackpoints[trackpoints.length - 1].timestamp;

  return mediaItems
    .map((item) => {
      if (!Number.isFinite(item.capturedAtTimestamp)) {
        return {
          ...item,
          alignmentStatus: "missing-timestamp",
          alignedActivityTimestamp: null,
          alignedActivityTime: null,
          nearestTrackIndex: null,
        };
      }

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
        nearestTrackIndex: findNearestTrackIndex(
          trackpoints,
          item.capturedAtTimestamp,
        ),
      };
    })
    .sort((left, right) => {
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
    });
}

function buildRoutePositions(Cesium, trackpoints) {
  return trackpoints.map((trackpoint) =>
    toRouteDisplayPosition(Cesium, trackpoint),
  );
}

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

function addRouteEntities(viewer, sampleTrack) {
  const Cesium = window.Cesium;
  const { trackpoints } = sampleTrack;
  const routePositions = buildRoutePositions(Cesium, trackpoints);
  const routeBoundingSphere = Cesium.BoundingSphere.fromPoints(routePositions);
  const startPosition = routePositions[0];
  const endPosition = routePositions[routePositions.length - 1];

  const routeEntity = viewer.entities.add({
    id: "sample-route",
    name: "Sample TCX route",
    polyline: {
      positions: routePositions,
      width: 2.5,
      clampToGround: false,
      material: Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.95),
    },
  });

  viewer.entities.add({
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

  viewer.entities.add({
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

function toRouteDisplayPosition(Cesium, trackpoint) {
  return Cesium.Cartesian3.fromDegrees(
    trackpoint.longitude,
    trackpoint.latitude,
    ROUTE_DISPLAY_HEIGHT_METERS,
  );
}

function setOverviewCamera(viewer, playbackState) {
  const Cesium = window.Cesium;
  const { routeBoundingSphere } = playbackState.camera;

  if (!routeBoundingSphere) {
    return;
  }

  viewer.camera.viewBoundingSphere(
    routeBoundingSphere,
    new Cesium.HeadingPitchRange(
      0,
      Cesium.Math.toRadians(-55),
      Math.max(routeBoundingSphere.radius * 2.8, 1800),
    ),
  );
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
}

function getLookAheadTrackIndex(playbackState, lookAheadPointCount = 12) {
  return Math.min(
    playbackState.currentIndex + lookAheadPointCount,
    playbackState.trackpoints.length - 1,
  );
}

function getFollowCameraLookAheadTargets(Cesium, playbackState, currentPosition) {
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

    if (!targets.nearPosition && candidateDistance >= 18) {
      targets.nearPosition = candidatePosition;
    }

    if (candidateDistance >= 42) {
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
  const lookAheadLimit = Math.min(
    playbackState.currentIndex + 24,
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
    0.25,
    3,
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
  const focusResponsiveness = Cesium.Math.lerp(0.24, 0.1, stabilityBias);
  const headingResponsiveness = Cesium.Math.lerp(0.28, 0.08, stabilityBias);

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
    0.25,
    3,
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
      Cesium.Math.lerp(8, 42, elevatedComplexity),
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
  const pitch = Cesium.Math.toRadians(
    Cesium.Math.lerp(-45, -68, elevatedComplexity),
  );
  const range = Cesium.Math.lerp(190, 390, elevatedComplexity);
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
  viewer.scene.globe.depthTestAgainstTerrain = false;
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
      toRouteDisplayPosition(Cesium, startTrackpoint);
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
    speed:
      startTrackpoint.speed === null || endTrackpoint.speed === null
        ? null
        : startTrackpoint.speed +
          (endTrackpoint.speed - startTrackpoint.speed) * segmentRatio,
  };
  playbackState.currentSamplePosition = Cesium.Cartesian3.fromDegrees(
    playbackState.currentSample.longitude,
    playbackState.currentSample.latitude,
    ROUTE_DISPLAY_HEIGHT_METERS,
  );
}

function buildPlayedRoutePositions(Cesium, playbackState) {
  const playedPositions = playbackState.playedRoutePositionsScratch;
  playedPositions.length = 0;

  for (let index = 0; index <= playbackState.currentIndex; index += 1) {
    playedPositions.push(playbackState.routePositions[index]);
  }

  if (
    playbackState.currentSamplePosition &&
    playbackState.currentSamplePosition !==
      playbackState.routePositions[playbackState.currentIndex]
  ) {
    playedPositions.push(playbackState.currentSamplePosition);
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
      width: 10,
      clampToGround: false,
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
        1,
        Math.round((EXPORT_OPTIONS.defaults.photoDisplayDurationMs ?? 5000) / 1000),
      ),
    );
  }

  if (photoKenBurnsCheckbox instanceof HTMLInputElement) {
    photoKenBurnsCheckbox.checked =
      EXPORT_OPTIONS.defaults.photoKenBurnsEnabled ?? true;
  }

  updateExportTimingControls();
}

function updateMediaLibraryUi() {
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

    const alignmentStatus = document.createElement("p");
    alignmentStatus.className = "media-library-status";
    alignmentStatus.textContent = formatMediaAlignmentStatus(item.alignmentStatus);

    const alignmentDetails = document.createElement("p");
    alignmentDetails.className = "media-library-meta";
    alignmentDetails.textContent = formatMediaAlignmentDetails(item);

    content.append(
      name,
      meta,
      status,
      timestampDetails,
      alignmentStatus,
      alignmentDetails,
    );
    listItem.append(thumbnail, content);
    mediaLibraryList.append(listItem);
  }
}

function setupMediaLibraryControls(viewer, sampleTrack) {
  const importMediaButton = document.getElementById("importMediaButton");

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
        mediaLibraryState.items = decorateMediaItemsForPreview(
          alignMediaItemsToTrack(
            mergeImportedMedia(
              mediaLibraryState.items,
              result.mediaItems,
            ),
            sampleTrack.trackpoints,
          ),
        );
        const alignedCount = mediaLibraryState.items.filter((item) => {
          return item.alignmentStatus === "aligned";
        }).length;
        const outOfRangeCount = mediaLibraryState.items.filter((item) => {
          return (
            item.alignmentStatus === "before-start" ||
            item.alignmentStatus === "after-end"
          );
        }).length;
        mediaLibraryState.statusMessage =
          result.mediaItems.length > 0
            ? `Library has ${mediaLibraryState.items.length} item${mediaLibraryState.items.length === 1 ? "" : "s"}; ${alignedCount} aligned, ${outOfRangeCount} out of range.`
            : "No supported media files were added.";
        mediaLibraryState.progress = {
          indeterminate: false,
          label: result.mediaItems.length > 0 ? "Import complete" : "No supported files",
          status: result.mediaItems.length > 0 ? "complete" : "idle",
          value: result.mediaItems.length > 0 ? 100 : 0,
        };
        syncMediaPreviewEntities(viewer, playbackState);
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
      updateMediaLibraryUi();
      if (window.playbackState) {
        void updateMediaPreviewOverlay(window.playbackState);
      }
    }
  });
}

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
  setElementDisabled("photoDisplayDurationInput", exportUiState.isExporting);
  setElementDisabled("photoKenBurnsCheckbox", exportUiState.isExporting);
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
    mediaItems: mediaLibraryState.items,
    photoDisplayDurationMs: mediaPresentationSettings.photoDisplayDurationMs,
    photoKenBurnsEnabled: mediaPresentationSettings.photoKenBurnsEnabled,
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
    currentTimestamp: playbackState.currentTimestamp,
    isPlaying: playbackState.isPlaying,
    speedMultiplier: playbackState.speedMultiplier,
  };
}

function restorePreviewSnapshot(viewer, playbackState, previewSnapshot) {
  if (!previewSnapshot) {
    return;
  }

  playbackState.export.cancelRequested = false;
  playbackState.speedMultiplier = previewSnapshot.speedMultiplier;
  playbackState.camera.mode = previewSnapshot.cameraMode;
  playbackState.camera.adaptiveStrength = previewSnapshot.adaptiveStrength;
  playbackState.isPlaying = false;
  resetFollowCameraSmoothing(playbackState);
  setPlaybackTimestamp(viewer, playbackState, previewSnapshot.currentTimestamp);

  if (previewSnapshot.isPlaying) {
    startPlayback(viewer, playbackState);
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
  playbackState.speedMultiplier = payload.settings.speedMultiplier;
  playbackState.camera.mode = payload.settings.cameraMode;
  playbackState.camera.adaptiveStrength = payload.settings.adaptiveStrength;
  resetFollowCameraSmoothing(playbackState);
  setPlaybackTimestamp(viewer, playbackState, payload.activityTimestamp, {
    updateMediaPreview: false,
    updateUi: false,
    deterministicCamera: true,
  });
  await updateMediaPreviewOverlay(playbackState, {
    awaitVideoFrame: true,
    exportActiveMedia: payload.activeMedia || null,
  });
  await settleSceneForCapture(viewer, payload.settings, () => {
    return playbackState.export.cancelRequested;
  });
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
    document.body.classList.add("export-session-active");
    setMediaPreviewEntitiesVisibility(false);
    viewer.resize();
    playbackState.speedMultiplier = payload.settings.speedMultiplier;
    playbackState.camera.mode = payload.settings.cameraMode;
    playbackState.camera.adaptiveStrength = payload.settings.adaptiveStrength;
    resetFollowCameraSmoothing(playbackState);
    setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp, {
      updateMediaPreview: false,
      updateUi: false,
      deterministicCamera: true,
    });
    hideMediaPreviewOverlay();

    try {
      await settleSceneForCapture(viewer, payload.settings, () => false);
      window.bikeFlyOverApp.notifyExportPrepared();
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      window.bikeFlyOverApp.notifyError(message, {
        mode: RENDER_MODE,
      });
    }
  });

  window.bikeFlyOverApp?.onExportReset(() => {
    document.body.classList.remove("export-session-active");
    viewer.resize();
    setMediaPreviewEntitiesVisibility(true);
    restorePreviewSnapshot(viewer, playbackState, exportBridgeState.previewSnapshot);
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
    setRouteStatus("Loading satellite basemap...");
    const viewer = createViewer(RENDER_MODE);
    const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();
    const playbackState = createPlaybackState(sampleTrack.trackpoints, {
      adaptiveStrength: EXPORT_OPTIONS.defaults.adaptiveStrength,
      speedMultiplier: EXPORT_OPTIONS.defaults.speedMultiplier,
      cameraMode: EXPORT_OPTIONS.defaults.cameraMode,
    });
    const { routeBoundingSphere, routeEntity, routePositions } = addRouteEntities(
      viewer,
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
      updatePlaybackUI(playbackState);
      updateCameraUI(playbackState);
      populateExportControls();
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
      setupMediaLibraryControls(viewer, sampleTrack);
      setupPlaybackControls(viewer, playbackState);
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
