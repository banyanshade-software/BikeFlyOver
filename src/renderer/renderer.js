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

function createPlaybackState(trackpoints) {
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
    isPlaying: true,
    speedMultiplier: 40,
    lastFrameTime: null,
    animationFrameId: null,
    markerEntity: null,
    progressEntity: null,
    routePositions: [],
    camera: {
      mode: "follow",
      smoothedFocus: null,
      smoothedHeading: null,
      routeEntity: null,
    },
  };
}

function buildRoutePositions(Cesium, trackpoints) {
  return trackpoints.map((trackpoint) =>
    Cesium.Cartesian3.fromDegrees(
      trackpoint.longitude,
      trackpoint.latitude,
      trackpoint.altitude,
    ),
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
    position: Cesium.Cartesian3.fromDegrees(
      startTrackpoint.longitude,
      startTrackpoint.latitude,
      startTrackpoint.altitude,
    ),
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
    position: Cesium.Cartesian3.fromDegrees(
      endTrackpoint.longitude,
      endTrackpoint.latitude,
      endTrackpoint.altitude,
    ),
    point: {
      pixelSize: 13,
      color: Cesium.Color.fromCssColorString("#ff8a5b"),
      outlineColor: Cesium.Color.fromCssColorString("#062032"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  return { routeEntity, routePositions };
}

async function frameRoute(viewer, routeEntity) {
  const Cesium = window.Cesium;

  await viewer.zoomTo(
    routeEntity,
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(0),
      Cesium.Math.toRadians(-55),
      1800,
    ),
  );
}

function getLookAheadTrackpoint(playbackState, lookAheadPointCount = 12) {
  return playbackState.trackpoints[
    Math.min(
      playbackState.currentIndex + lookAheadPointCount,
      playbackState.trackpoints.length - 1,
    )
  ];
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

function updateFollowCamera(viewer, playbackState) {
  const Cesium = window.Cesium;

  if (playbackState.camera.mode !== "follow") {
    return;
  }

  const currentPosition = toCartesianPosition(Cesium, playbackState.currentSample);
  const lookAheadTrackpoint = getLookAheadTrackpoint(playbackState);
  const lookAheadPosition = toCartesianPosition(Cesium, lookAheadTrackpoint);
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const up = ellipsoid.geodeticSurfaceNormal(
    currentPosition,
    new Cesium.Cartesian3(),
  );
  const rawForward = Cesium.Cartesian3.subtract(
    lookAheadPosition,
    currentPosition,
    new Cesium.Cartesian3(),
  );

  if (Cesium.Cartesian3.magnitudeSquared(rawForward) === 0) {
    return;
  }

  const transform = Cesium.Transforms.eastNorthUpToFixedFrame(currentPosition);
  const inverseTransform = Cesium.Matrix4.inverseTransformation(
    transform,
    new Cesium.Matrix4(),
  );
  const localForward = Cesium.Matrix4.multiplyByPointAsVector(
    inverseTransform,
    rawForward,
    new Cesium.Cartesian3(),
  );

  if (
    !Number.isFinite(localForward.x) ||
    !Number.isFinite(localForward.y) ||
    (localForward.x === 0 && localForward.y === 0)
  ) {
    return;
  }

  const desiredHeading = Math.atan2(localForward.x, localForward.y);
  const desiredFocus = Cesium.Cartesian3.add(
    currentPosition,
    Cesium.Cartesian3.multiplyByScalar(up, 8, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );

  if (!playbackState.camera.smoothedFocus) {
    playbackState.camera.smoothedFocus = Cesium.Cartesian3.clone(desiredFocus);
    playbackState.camera.smoothedHeading = desiredHeading;
  } else {
    Cesium.Cartesian3.lerp(
      playbackState.camera.smoothedFocus,
      desiredFocus,
      0.18,
      playbackState.camera.smoothedFocus,
    );
    const headingDelta = Cesium.Math.negativePiToPi(
      desiredHeading - playbackState.camera.smoothedHeading,
    );
    playbackState.camera.smoothedHeading = Cesium.Math.negativePiToPi(
      playbackState.camera.smoothedHeading + headingDelta * 0.14,
    );
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

function createViewer() {
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

function toCartesianPosition(Cesium, trackpoint) {
  return Cesium.Cartesian3.fromDegrees(
    trackpoint.longitude,
    trackpoint.latitude,
    trackpoint.altitude,
  );
}

function buildPlayedRoutePositions(Cesium, playbackState) {
  const playedPositions = playbackState.routePositions.slice(
    0,
    playbackState.currentIndex + 1,
  );

  if (playbackState.currentSample) {
    playedPositions.push(toCartesianPosition(Cesium, playbackState.currentSample));
  }

  return playedPositions;
}

function addPlaybackEntities(viewer, playbackState) {
  const Cesium = window.Cesium;

  const markerEntity = viewer.entities.add({
    id: "current-position-marker",
    name: "Current position",
    position: toCartesianPosition(Cesium, playbackState.currentSample),
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
      width: 30, /* xxxx */ 
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
    playbackState.markerEntity.position = toCartesianPosition(
      Cesium,
      playbackState.currentSample,
    );
  }
}

function updatePlaybackUI(playbackState) {
  const elapsedMs = playbackState.currentTimestamp - playbackState.startTimestamp;
  const progressRatio =
    playbackState.durationMs === 0 ? 1 : elapsedMs / playbackState.durationMs;

  setTextContent("playbackStatus", playbackState.isPlaying ? "Playing" : "Paused");
  setTextContent("playbackProgress", formatProgress(progressRatio));
  setTextContent(
    "playbackCurrentTime",
    formatTimestamp(playbackState.currentSample.time),
  );
  setTextContent("playbackSpeed", `${playbackState.speedMultiplier}x track time`);
  setPlaybackButtonLabel(playbackState.isPlaying ? "Pause" : "Play");
}

function syncPlaybackState(viewer, playbackState) {
  advancePlaybackIndex(playbackState);
  interpolateTrackpoint(playbackState);
  updateMarkerPosition(playbackState);
  updateFollowCamera(viewer, playbackState);
  updatePlaybackUI(playbackState);
  updateCameraUI(playbackState);
}

function stopPlayback(playbackState) {
  if (playbackState.animationFrameId !== null) {
    window.cancelAnimationFrame(playbackState.animationFrameId);
    playbackState.animationFrameId = null;
  }
}

function stopCameraMotion(viewer) {
  viewer.camera.cancelFlight();
}

function freezeFollowCamera(viewer, playbackState) {
  const Cesium = window.Cesium;

  if (playbackState.camera.mode !== "follow") {
    stopCameraMotion(viewer);
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
  playbackState.currentTimestamp = Math.min(
    playbackState.endTimestamp,
    playbackState.currentTimestamp + deltaMs * playbackState.speedMultiplier,
  );

  syncPlaybackState(viewer, playbackState);

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
  resetFollowCameraSmoothing(playbackState);
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
  playbackState.currentTimestamp = playbackState.startTimestamp;
  playbackState.currentIndex = 0;
  playbackState.currentSample = playbackState.trackpoints[0];
  playbackState.lastFrameTime = null;
  resetFollowCameraSmoothing(playbackState);
  syncPlaybackState(viewer, playbackState);
  startPlayback(viewer, playbackState);
}

function switchCameraMode(viewer, playbackState) {
  if (playbackState.camera.mode === "follow") {
    playbackState.camera.mode = "overview";
    resetFollowCameraSmoothing(playbackState);
    if (playbackState.camera.routeEntity) {
      void frameRoute(viewer, playbackState.camera.routeEntity);
    }
  } else {
    playbackState.camera.mode = "follow";
    resetFollowCameraSmoothing(playbackState);
    updateFollowCamera(viewer, playbackState);
  }

  updateCameraUI(playbackState);
}

function setupPlaybackControls(viewer, playbackState) {
  const playPauseButton = document.getElementById("playPauseButton");
  const restartButton = document.getElementById("restartButton");
  const cameraModeButton = document.getElementById("cameraModeButton");

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
}

async function initializeApp() {
  try {
    setRouteStatus("Loading satellite basemap...");
    const viewer = createViewer();
    const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();
    const playbackState = createPlaybackState(sampleTrack.trackpoints);
    const { routeEntity, routePositions } = addRouteEntities(viewer, sampleTrack);
    playbackState.routePositions = routePositions;
    playbackState.camera.routeEntity = routeEntity;
    addPlaybackEntities(viewer, playbackState);
    renderSummary(sampleTrack);
    syncPlaybackState(viewer, playbackState);
    await frameRoute(viewer, routeEntity);
    updateFollowCamera(viewer, playbackState);

    window.bikeFlyOverViewer = viewer;
    window.sampleTrack = sampleTrack;
    window.sampleRouteEntity = routeEntity;
    window.playbackState = playbackState;

    updatePlaybackUI(playbackState);
    updateCameraUI(playbackState);
    setupPlaybackControls(viewer, playbackState);
    startPlayback(viewer, playbackState);
    console.log("BikeFlyOver sample track summary:", sampleTrack.summary);
    setRouteStatus(
      `Completed route is bold blue; upcoming route stays thin white.`,
    );
    setStatus(
      `Following ${sampleTrack.fileName} with a trailing 3D camera.`,
    );
    window.bikeFlyOverApp?.notifyReady();
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error ? error.stack || error.message : String(error);

    setStatus("Cesium initialization failed.");
    window.bikeFlyOverApp?.notifyError(message);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  void initializeApp();
});
