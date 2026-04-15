const { pathToFileURL } = require("node:url");
const { contextBridge, ipcRenderer } = require("electron");
const { loadSampleTrack } = require("../shared/sample-track");
const {
  CAMERA_SETTINGS_FIELDS,
  EXPORT_CAMERA_MODES,
  EXPORT_DEFAULTS,
  EXPORT_RESOLUTION_PRESETS,
  EXPORT_SETTINGS_FIELDS,
  // F-69: expose terrain parameter metadata from shared settings so the renderer can drive one terrain UI/state model.
  TERRAIN_SETTINGS_FIELDS,
  // end F-69
  EXPORT_TIMING_MODES,
} = require("../shared/export");
const {
  MEDIA_PRESENTATION_SETTINGS_FIELDS,
  OVERLAY_VISIBILITY_FIELDS,
} = require("../shared/parameter-config");

function subscribe(channel, listener) {
  const wrappedListener = (_event, payload) => {
    listener(payload);
  };

  ipcRenderer.on(channel, wrappedListener);

  return () => {
    ipcRenderer.removeListener(channel, wrappedListener);
  };
}

contextBridge.exposeInMainWorld("bikeFlyOverApp", {
  loadSampleTrack,
  getExportOptions() {
    return {
      defaults: EXPORT_DEFAULTS,
      parameterConfig: {
        cameraSettings: CAMERA_SETTINGS_FIELDS,
        exportSettings: EXPORT_SETTINGS_FIELDS,
        mediaPresentation: MEDIA_PRESENTATION_SETTINGS_FIELDS,
        overlayVisibility: OVERLAY_VISIBILITY_FIELDS,
        // F-69: surface terrain parameter limits/defaults so preview/export use the same exaggeration settings.
        terrainSettings: TERRAIN_SETTINGS_FIELDS,
        // end F-69
      },
      resolutionPresets: EXPORT_RESOLUTION_PRESETS,
      cameraModes: EXPORT_CAMERA_MODES,
      timingModes: EXPORT_TIMING_MODES,
    };
  },
  importMedia() {
    return ipcRenderer.invoke("media-import");
  },
  toFileUrl(filePath) {
    return pathToFileURL(filePath).href;
  },
  startExport(settings) {
    return ipcRenderer.invoke("export-start", settings);
  },
  cancelExport() {
    return ipcRenderer.invoke("export-cancel");
  },
  onExportStatus(listener) {
    return subscribe("export-status", listener);
  },
  onExportPrepare(listener) {
    return subscribe("export-prepare", listener);
  },
  onExportReset(listener) {
    return subscribe("export-reset", listener);
  },
  onRenderExportFrame(listener) {
    return subscribe("export-render-frame", listener);
  },
  onExportCancel(listener) {
    return subscribe("export-cancelled", listener);
  },
  notifyExportPrepared(payload = {}) {
    ipcRenderer.send("export-prepared", payload);
  },
  notifyExportFrameSettled(payload) {
    ipcRenderer.send("export-frame-settled", payload);
  },
  notifyReady(details = {}) {
    ipcRenderer.send("renderer-ready", details);
  },
  notifyError(message, details = {}) {
    ipcRenderer.send("renderer-error", {
      message,
      ...details,
    });
  },
});
