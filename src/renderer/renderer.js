function setStatus(message) {
  const statusElement = document.getElementById("status");

  if (statusElement) {
    statusElement.textContent = message;
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
  `;
}

function createViewer() {
  const Cesium = window.Cesium;

  if (!Cesium) {
    throw new Error("Cesium failed to load in the renderer.");
  }

  const viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
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
    imageryProvider: new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
      credit: "OpenStreetMap contributors",
    }),
  });

  viewer.scene.globe.enableLighting = true;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(1.4289, 43.6125, 6000),
    orientation: {
      heading: Cesium.Math.toRadians(20),
      pitch: Cesium.Math.toRadians(-40),
      roll: 0,
    },
  });

  return viewer;
}

async function initializeApp() {
  try {
    const viewer = createViewer();
    const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();

    window.bikeFlyOverViewer = viewer;
    window.sampleTrack = sampleTrack;

    renderSummary(sampleTrack);
    console.log("BikeFlyOver sample track summary:", sampleTrack.summary);
    setStatus(
      `Loaded ${sampleTrack.summary.pointCount.toLocaleString()} trackpoints from ${sampleTrack.fileName}.`,
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
