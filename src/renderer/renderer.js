function setStatus(message) {
  const statusElement = document.getElementById("status");

  if (statusElement) {
    statusElement.textContent = message;
  }
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

window.addEventListener("DOMContentLoaded", () => {
  try {
    const viewer = createViewer();

    window.bikeFlyOverViewer = viewer;
    setStatus("Cesium viewer ready.");
    window.bikeFlyOverApp?.notifyReady();
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error ? error.stack || error.message : String(error);

    setStatus("Cesium initialization failed.");
    window.bikeFlyOverApp?.notifyError(message);
  }
});
