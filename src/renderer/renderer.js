const EXPORT_OPTIONS = window.bikeFlyOverApp?.getExportOptions?.() || {
  defaults: {
    resolutionId: "landscape-720p",
    width: 1280,
    height: 720,
    fps: 30,
    speedMultiplier: 40,
    cameraMode: "follow",
    settleTimeoutMs: 15000,
    settleStablePasses: 2,
    maxFrameRetries: 1,
  },
  resolutionPresets: [],
  cameraModes: [],
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
};
const TIMELINE_SLIDER_MAX = 1000;
const MEDIA_PREVIEW_LEAD_IN_MS = 500;
const MEDIA_PREVIEW_HOLD_MS = 1800;
const MEDIA_PREVIEW_LEAD_OUT_MS = 700;
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

function decorateMediaItemsForPreview(mediaItems) {
  return mediaItems.map((item) => {
    return {
      ...item,
      previewUrl: item.previewUrl || getMediaPreviewUrl(item.filePath),
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

function syncMediaPreviewEntities(viewer, trackpoints) {
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
      const trackpoint = trackpoints[item.nearestTrackIndex];

      if (!trackpoint) {
        return null;
      }

      return viewer.entities.add({
        id: `media-preview-${item.id}`,
        position: toRouteDisplayPosition(Cesium, trackpoint),
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

function getActiveMediaPreviewPresentation(playbackTimestamp) {
  let bestMatch = null;

  for (const item of mediaLibraryState.items) {
    if (
      item.alignmentStatus !== "aligned" ||
      !Number.isFinite(item.alignedActivityTimestamp)
    ) {
      continue;
    }

    const startTimestamp = item.alignedActivityTimestamp - MEDIA_PREVIEW_LEAD_IN_MS;
    const endTimestamp =
      item.alignedActivityTimestamp +
      MEDIA_PREVIEW_HOLD_MS +
      MEDIA_PREVIEW_LEAD_OUT_MS;

    if (playbackTimestamp < startTimestamp || playbackTimestamp > endTimestamp) {
      continue;
    }

    const offsetMs = Math.abs(item.alignedActivityTimestamp - playbackTimestamp);

    if (!bestMatch || offsetMs < bestMatch.offsetMs) {
      const relativeTimestamp = playbackTimestamp - startTimestamp;
      let opacity = 1;
      let translateY = 0;
      let scale = 1;

      if (relativeTimestamp < MEDIA_PREVIEW_LEAD_IN_MS) {
        const enterProgress = relativeTimestamp / MEDIA_PREVIEW_LEAD_IN_MS;

        opacity = enterProgress;
        translateY = 18 * (1 - enterProgress);
        scale = 0.94 + 0.06 * enterProgress;
      } else if (
        relativeTimestamp >
        MEDIA_PREVIEW_LEAD_IN_MS + MEDIA_PREVIEW_HOLD_MS
      ) {
        const exitProgress =
          (relativeTimestamp - MEDIA_PREVIEW_LEAD_IN_MS - MEDIA_PREVIEW_HOLD_MS) /
          MEDIA_PREVIEW_LEAD_OUT_MS;

        opacity = 1 - exitProgress;
        translateY = -10 * exitProgress;
        scale = 1 + 0.03 * exitProgress;
      }

      bestMatch = {
        item,
        offsetMs,
        opacity,
        translateY,
        scale,
      };
    }
  }

  return bestMatch;
}

function hideMediaPreviewOverlay() {
  const overlayElement = document.getElementById("mediaPreviewOverlay");

  if (overlayElement instanceof HTMLElement) {
    overlayElement.hidden = true;
  }

  mediaLibraryState.activePreviewItemId = null;
}

function updateMediaPreviewOverlay(playbackState) {
  const overlayElement = document.getElementById("mediaPreviewOverlay");
  const cardElement = document.getElementById("mediaPreviewCard");
  const imageElement = document.getElementById("mediaPreviewImage");
  const fallbackElement = document.getElementById("mediaPreviewFallback");
  const fallbackLabelElement = document.getElementById("mediaPreviewFallbackLabel");

  if (
    !(overlayElement instanceof HTMLElement) ||
    !(cardElement instanceof HTMLElement) ||
    !(imageElement instanceof HTMLImageElement) ||
    !(fallbackElement instanceof HTMLDivElement) ||
    !(fallbackLabelElement instanceof HTMLElement)
  ) {
    return;
  }

  if (
    RENDER_MODE !== "preview" ||
    !document.body.classList.contains("export-session-active")
  ) {
    overlayElement.hidden = true;
    mediaLibraryState.activePreviewItemId = null;
    return;
  }

  const presentation = getActiveMediaPreviewPresentation(
    playbackState.currentTimestamp,
  );

  if (!presentation) {
    overlayElement.hidden = true;
    imageElement.removeAttribute("src");
    mediaLibraryState.activePreviewItemId = null;
    return;
  }

  const { item: activeItem, opacity, scale, translateY } = presentation;

  cardElement.style.opacity = String(opacity);
  cardElement.style.transform = `translateY(${translateY}px) scale(${scale})`;

  if (mediaLibraryState.activePreviewItemId !== activeItem.id) {
    mediaLibraryState.activePreviewItemId = activeItem.id;

    setTextContent("mediaPreviewType", formatMediaType(activeItem.mediaType));
    setTextContent("mediaPreviewName", activeItem.fileName);
    setTextContent(
      "mediaPreviewTime",
      activeItem.alignedActivityTime
        ? `Aligned at ${formatTimestamp(activeItem.alignedActivityTime)}`
        : "Aligned media preview",
    );

    imageElement.alt = `${formatMediaType(activeItem.mediaType)} preview for ${activeItem.fileName}`;
    imageElement.onerror = null;

    if (activeItem.mediaType === "image" && activeItem.previewUrl) {
      fallbackElement.hidden = true;
      fallbackLabelElement.textContent = "Preview unavailable";
      imageElement.hidden = false;
      imageElement.onerror = () => {
        imageElement.hidden = true;
        fallbackElement.hidden = false;
        fallbackLabelElement.textContent = "Image preview unavailable";
      };
      imageElement.src = activeItem.previewUrl;
    } else {
      imageElement.hidden = true;
      imageElement.removeAttribute("src");
      fallbackElement.hidden = false;
      fallbackLabelElement.textContent =
        activeItem.mediaType === "video" ? "Video clip preview" : "Preview unavailable";
    }
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
    routePositions: [],
    camera: {
      mode: options.cameraMode ?? EXPORT_OPTIONS.defaults.cameraMode,
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
  const startTrackpoint = trackpoints[0];
  const endTrackpoint = trackpoints[trackpoints.length - 1];

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
    position: toRouteDisplayPosition(Cesium, startTrackpoint),
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
    position: toRouteDisplayPosition(Cesium, endTrackpoint),
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

function getLookAheadTrackpoint(playbackState, lookAheadPointCount = 12) {
  return playbackState.trackpoints[
    Math.min(
      playbackState.currentIndex + lookAheadPointCount,
      playbackState.trackpoints.length - 1,
    )
  ];
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
    const candidatePosition = toRouteDisplayPosition(
      Cesium,
      playbackState.trackpoints[trackpointIndex],
    );
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

  const fallbackPosition = toRouteDisplayPosition(
    Cesium,
    getLookAheadTrackpoint(playbackState),
  );

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

function getStableFollowHeading(
  Cesium,
  playbackState,
  currentPosition,
  inverseTransform,
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

  if (nearDirection) {
    const normalizedNearDirection = Cesium.Cartesian3.normalize(
      nearDirection,
      new Cesium.Cartesian3(),
    );
    Cesium.Cartesian3.add(
      blendedDirection,
      Cesium.Cartesian3.multiplyByScalar(
        normalizedNearDirection,
        0.7,
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
        0.3,
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

  return Math.atan2(blendedDirection.x, blendedDirection.y);
}

function updateSmoothedFollowCameraState(
  Cesium,
  playbackState,
  desiredFocus,
  desiredHeading,
  useSmoothing,
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

  Cesium.Cartesian3.lerp(
    playbackState.camera.smoothedFocus,
    desiredFocus,
    Cesium.Math.lerp(0.16, 0.28, turnSharpness),
    playbackState.camera.smoothedFocus,
  );

  if (absoluteHeadingDelta < Cesium.Math.toRadians(1.25)) {
    return;
  }

  playbackState.camera.smoothedHeading = Cesium.Math.negativePiToPi(
    playbackState.camera.smoothedHeading +
      headingDelta * Cesium.Math.lerp(0.12, 0.34, turnSharpness),
  );
}

function updateFollowCamera(viewer, playbackState, options = {}) {
  const Cesium = window.Cesium;
  const useSmoothing = options.useSmoothing ?? true;

  if (playbackState.camera.mode !== "follow") {
    return;
  }

  const currentPosition = toRouteDisplayPosition(
    Cesium,
    playbackState.currentSample,
  );
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
  const desiredFocus = Cesium.Cartesian3.add(
    currentPosition,
    Cesium.Cartesian3.multiplyByScalar(up, 8, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const desiredHeading = getStableFollowHeading(
    Cesium,
    playbackState,
    currentPosition,
    inverseTransform,
  );

  updateSmoothedFollowCameraState(
    Cesium,
    playbackState,
    desiredFocus,
    desiredHeading,
    useSmoothing,
  );

  if (
    !playbackState.camera.smoothedFocus ||
    !Number.isFinite(playbackState.camera.smoothedHeading)
  ) {
    return;
  }

  const heading = playbackState.camera.smoothedHeading;
  const pitch = Cesium.Math.toRadians(-45);
  const range = 190;
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
  const { currentIndex, currentTimestamp, trackpoints } = playbackState;
  const startTrackpoint = trackpoints[currentIndex];
  const endTrackpoint =
    trackpoints[Math.min(currentIndex + 1, trackpoints.length - 1)];

  if (startTrackpoint.timestamp === endTrackpoint.timestamp) {
    playbackState.currentSample = {
      ...startTrackpoint,
      timestamp: currentTimestamp,
    };
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
}

function buildPlayedRoutePositions(Cesium, playbackState) {
  const playedPositions = playbackState.routePositions.slice(
    0,
    playbackState.currentIndex + 1,
  );

  if (playbackState.currentSample) {
    playedPositions.push(
      toRouteDisplayPosition(Cesium, playbackState.currentSample),
    );
  }

  return playedPositions;
}

function addPlaybackEntities(viewer, playbackState) {
  const Cesium = window.Cesium;

  const markerEntity = viewer.entities.add({
    id: "current-position-marker",
    name: "Current position",
    position: toRouteDisplayPosition(Cesium, playbackState.currentSample),
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
  const Cesium = window.Cesium;

  if (playbackState.markerEntity) {
    playbackState.markerEntity.position = toRouteDisplayPosition(
      Cesium,
      playbackState.currentSample,
    );
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
    updateMediaPreviewOverlay(playbackState);
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

function populateExportControls() {
  const resolutionSelect = document.getElementById("exportResolutionSelect");
  const cameraModeSelect = document.getElementById("exportCameraModeSelect");
  const fpsInput = document.getElementById("exportFpsInput");
  const speedInput = document.getElementById("exportSpeedInput");

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

  if (fpsInput instanceof HTMLInputElement) {
    fpsInput.value = String(EXPORT_OPTIONS.defaults.fps);
  }

  if (speedInput instanceof HTMLInputElement) {
    speedInput.value = String(EXPORT_OPTIONS.defaults.speedMultiplier);
  }
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

    const name = document.createElement("p");
    name.className = "media-library-name";
    name.textContent = item.fileName;

    const meta = document.createElement("p");
    meta.className = "media-library-meta";
    meta.textContent = `${formatMediaType(item.mediaType)} · ${item.filePath}`;

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

    listItem.append(
      name,
      meta,
      status,
      timestampDetails,
      alignmentStatus,
      alignmentDetails,
    );
    mediaLibraryList.append(listItem);
  }
}

function setupMediaLibraryControls(viewer, sampleTrack) {
  const importMediaButton = document.getElementById("importMediaButton");

  importMediaButton?.addEventListener("click", async () => {
    mediaLibraryState.isImporting = true;
    updateMediaLibraryUi();

    try {
      const result = await window.bikeFlyOverApp.importMedia();

      if (!result?.cancelled && Array.isArray(result?.mediaItems)) {
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
        syncMediaPreviewEntities(viewer, sampleTrack.trackpoints);
      } else if (result?.cancelled) {
        mediaLibraryState.statusMessage =
          mediaLibraryState.items.length > 0
            ? "Import cancelled."
            : "No media imported yet.";
      }
    } catch (error) {
      mediaLibraryState.statusMessage =
        error instanceof Error ? error.message : String(error);
    } finally {
      mediaLibraryState.isImporting = false;
      updateMediaLibraryUi();
      if (window.playbackState) {
        updateMediaPreviewOverlay(window.playbackState);
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

  exportUiState.isExporting = ["starting", "running", "encoding"].includes(
    statusUpdate.status,
  );
  setElementDisabled("startExportButton", exportUiState.isExporting);
  setElementDisabled("cancelExportButton", !exportUiState.isExporting);
  setElementDisabled("exportResolutionSelect", exportUiState.isExporting);
  setElementDisabled("exportFpsInput", exportUiState.isExporting);
  setElementDisabled("exportSpeedInput", exportUiState.isExporting);
  setElementDisabled("exportCameraModeSelect", exportUiState.isExporting);
  setElementDisabled(
    "importMediaButton",
    exportUiState.isExporting || mediaLibraryState.isImporting,
  );
}

function readExportSettings() {
  const resolutionSelect = document.getElementById("exportResolutionSelect");
  const fpsInput = document.getElementById("exportFpsInput");
  const speedInput = document.getElementById("exportSpeedInput");
  const cameraModeSelect = document.getElementById("exportCameraModeSelect");

  return {
    resolutionId:
      resolutionSelect instanceof HTMLSelectElement
        ? resolutionSelect.value
        : EXPORT_OPTIONS.defaults.resolutionId,
    fps:
      fpsInput instanceof HTMLInputElement
        ? Number(fpsInput.value)
        : EXPORT_OPTIONS.defaults.fps,
    speedMultiplier:
      speedInput instanceof HTMLInputElement
        ? Number(speedInput.value)
        : EXPORT_OPTIONS.defaults.speedMultiplier,
    cameraMode:
      cameraModeSelect instanceof HTMLSelectElement
        ? cameraModeSelect.value
        : EXPORT_OPTIONS.defaults.cameraMode,
  };
}

function setupExportControls() {
  const startExportButton = document.getElementById("startExportButton");
  const cancelExportButton = document.getElementById("cancelExportButton");

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
  resetFollowCameraSmoothing(playbackState);
  setPlaybackTimestamp(viewer, playbackState, payload.activityTimestamp, {
    updateUi: false,
    deterministicCamera: true,
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
    resetFollowCameraSmoothing(playbackState);
    setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp, {
      updateUi: false,
      deterministicCamera: true,
    });

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
    updateMediaPreviewOverlay(playbackState);
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
      speedMultiplier: EXPORT_OPTIONS.defaults.speedMultiplier,
      cameraMode: EXPORT_OPTIONS.defaults.cameraMode,
    });
    const { routeBoundingSphere, routeEntity, routePositions } = addRouteEntities(
      viewer,
      sampleTrack,
    );

    playbackState.routePositions = routePositions;
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
      updateMediaLibraryUi();
      updateMediaPreviewOverlay(playbackState);
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
