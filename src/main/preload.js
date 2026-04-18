const { pathToFileURL } = require("node:url");
const { contextBridge, ipcRenderer } = require("electron");
const {
  MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
  MEDIA_ALIGNMENT_OFFSET_FIELDS,
  alignMediaItemsToTrack: alignMediaItemsToTrackShared,
  normalizeMediaAlignmentOffsets: normalizeMediaAlignmentOffsetsShared,
} = require("../shared/media-alignment");
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
  // F-72/F-73/F-74: expose gauge size constants so renderer can compute proportional gauge scaling.
  GAUGE_SIZE_CONFIG,
  // end F-72/F-73/F-74
  MEDIA_PRESENTATION_SETTINGS_FIELDS,
  OVERLAY_VISIBILITY_FIELDS,
} = require("../shared/parameter-config");
// F-76: expose animation effects registry so the renderer can drive effect-specific transforms.
const {
  MEDIA_ANIMATION_EFFECTS,
} = require("../shared/media-presentation");
// end F-76

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
  // F-21: expose shared alignment offset helpers so the renderer can re-align media without duplicating drift logic.
  alignMediaItemsToTrack(mediaItems, trackpoints, offsets) {
    return alignMediaItemsToTrackShared(mediaItems, trackpoints, offsets);
  },
  // end F-21
  loadSampleTrack,
  // F-21: publish the shared offset defaults/limits and normalizer so UI edits stay aligned with the shared timing model.
  getMediaAlignmentOptions() {
    return {
      defaults: MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
      parameterConfig: MEDIA_ALIGNMENT_OFFSET_FIELDS,
    };
  },
  normalizeMediaAlignmentOffsets(offsets) {
    return normalizeMediaAlignmentOffsetsShared(offsets);
  },
  // end F-21
  getExportOptions() {
    return {
      defaults: EXPORT_DEFAULTS,
      parameterConfig: {
        cameraSettings: CAMERA_SETTINGS_FIELDS,
        exportSettings: EXPORT_SETTINGS_FIELDS,
        // F-72/F-73/F-74: expose gauge size config so renderer can scale overlays proportionally.
        gaugeSizeConfig: GAUGE_SIZE_CONFIG,
        // end F-72/F-73/F-74
        mediaPresentation: MEDIA_PRESENTATION_SETTINGS_FIELDS,
        overlayVisibility: OVERLAY_VISIBILITY_FIELDS,
        // F-69: surface terrain parameter limits/defaults so preview/export use the same exaggeration settings.
        terrainSettings: TERRAIN_SETTINGS_FIELDS,
        // end F-69
      },
      resolutionPresets: EXPORT_RESOLUTION_PRESETS,
      cameraModes: EXPORT_CAMERA_MODES,
      timingModes: EXPORT_TIMING_MODES,
      // F-76: expose animation effect IDs and labels (plain data only — functions cannot cross the context bridge).
      mediaAnimationEffects: Object.entries(MEDIA_ANIMATION_EFFECTS).map(
        ([id, { label }]) => ({ id, label }),
      ),
      // end F-76
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
