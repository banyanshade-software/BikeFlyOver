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
      width: 7,
      clampToGround: false,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString("#43d9ff"),
        glowPower: 0.22,
      }),
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

  return routeEntity;
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

  return viewer;
}

async function initializeApp() {
  try {
    setRouteStatus("Loading satellite basemap...");
    const viewer = createViewer();
    const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();
    const routeEntity = addRouteEntities(viewer, sampleTrack);
    await frameRoute(viewer, routeEntity);

    window.bikeFlyOverViewer = viewer;
    window.sampleTrack = sampleTrack;
    window.sampleRouteEntity = routeEntity;

    renderSummary(sampleTrack);
    console.log("BikeFlyOver sample track summary:", sampleTrack.summary);
    setRouteStatus(
      `Highlighted ${sampleTrack.summary.pointCount.toLocaleString()} points in 3D.`,
    );
    setStatus(
      `Loaded and framed ${sampleTrack.fileName} with a highlighted 3D route.`,
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
