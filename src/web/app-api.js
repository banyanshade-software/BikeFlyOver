// F-web: Browser implementation of the window.bikeFlyOverApp interface.
// Replaces src/main/preload.js for the web build — same API surface, no Electron/IPC.
// Must be loaded before renderer.js (both are type="module"; ES modules execute in order).

import {
  MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
  MEDIA_ALIGNMENT_OFFSET_FIELDS,
  alignMediaItemsToTrack,
  normalizeMediaAlignmentOffsets,
} from "../shared/media-alignment.js";
import {
  CAMERA_SETTINGS_FIELDS,
  EXPORT_CAMERA_MODES,
  EXPORT_DEFAULTS,
  EXPORT_RESOLUTION_PRESETS,
  EXPORT_SETTINGS_FIELDS,
  EXPORT_STRATEGY_MODES,
  TERRAIN_SETTINGS_FIELDS,
  EXPORT_TIMING_MODES,
  normalizeExportSettings,
} from "../shared/export.js";
import {
  GAUGE_SIZE_CONFIG,
  MEDIA_PRESENTATION_SETTINGS_FIELDS,
  OVERLAY_VISIBILITY_FIELDS,
} from "../shared/parameter-config.js";
import { MEDIA_ANIMATION_EFFECTS } from "../shared/media-presentation.js";
import { parseGpxTrack } from "../io/gpx/parseGpx.js";
import { summarizeTrackpoints } from "../io/tcx/parseTcx.js";
import { openMediaFilePicker } from "./media-import.js";
import { ExportBus, startWebExport, cancelWebExport } from "./export-engine.js";

// ── State ────────────────────────────────────────────────────────────────────

// Stored by loadSampleTrack() — export engine needs the trackpoints.
let _currentTrack = null;

// Single export bus shared between the export engine and the renderer.
const exportBus = new ExportBus();

// ── loadSampleTrack ──────────────────────────────────────────────────────────

async function loadSampleTrack() {
  const response = await fetch("/samples/activity.gpx");
  if (!response.ok) {
    throw new Error(`Failed to fetch sample track: ${response.status} ${response.statusText}`);
  }
  const xml = await response.text();
  const trackpoints = parseGpxTrack(xml);
  const summary = summarizeTrackpoints(trackpoints);

  _currentTrack = {
    fileName: "activity.gpx",
    filePath: "/samples/activity.gpx",
    trackpoints,
    summary,
    samplePath: "/samples/activity.gpx",
  };

  return _currentTrack;
}

// ── Export bridge ────────────────────────────────────────────────────────────

async function startExport(settings) {
  if (!_currentTrack) {
    throw new Error("No track loaded. Load the sample track before exporting.");
  }

  const normalizedSettings = normalizeExportSettings({
    ...EXPORT_DEFAULTS,
    ...settings,
  });

  exportBus.emit("export-status", {
    status: "starting",
    phase: "initialising",
    message: "Starting web export…",
    currentFrame: 0,
    totalFrames: 0,
  });

  // Run the export asynchronously so this call returns quickly (matching Electron behavior).
  void startWebExport(normalizedSettings, _currentTrack.trackpoints, exportBus).catch(
    (err) => {
      console.error("[app-api] export error:", err);
    },
  );

  return {
    started: true,
    outputPath: null,
    totalFrames: 0,
    settings: normalizedSettings,
  };
}

function cancelExport() {
  cancelWebExport();
  return Promise.resolve();
}

// ── API object ───────────────────────────────────────────────────────────────

window.bikeFlyOverApp = {
  isWebMode: true,

  // F-21: shared alignment helpers pass through unchanged.
  alignMediaItemsToTrack(mediaItems, trackpoints, offsets) {
    return alignMediaItemsToTrack(mediaItems, trackpoints, offsets);
  },
  // end F-21

  loadSampleTrack,

  // F-21: shared alignment options.
  getMediaAlignmentOptions() {
    return {
      defaults: MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
      parameterConfig: MEDIA_ALIGNMENT_OFFSET_FIELDS,
    };
  },
  normalizeMediaAlignmentOffsets(offsets) {
    return normalizeMediaAlignmentOffsets(offsets);
  },
  // end F-21

  getExportOptions() {
    return {
      defaults: EXPORT_DEFAULTS,
      parameterConfig: {
        cameraSettings: CAMERA_SETTINGS_FIELDS,
        exportSettings: EXPORT_SETTINGS_FIELDS,
        // F-72/F-73/F-74: gauge size config for proportional overlay scaling.
        gaugeSizeConfig: GAUGE_SIZE_CONFIG,
        // end F-72/F-73/F-74
        mediaPresentation: MEDIA_PRESENTATION_SETTINGS_FIELDS,
        overlayVisibility: OVERLAY_VISIBILITY_FIELDS,
        // F-69: terrain parameter limits/defaults.
        terrainSettings: TERRAIN_SETTINGS_FIELDS,
        // end F-69
      },
      resolutionPresets: EXPORT_RESOLUTION_PRESETS,
      cameraModes: EXPORT_CAMERA_MODES,
      timingModes: EXPORT_TIMING_MODES,
      // F-web: web-mode export strategies for the export engine selector.
      exportStrategyModes: EXPORT_STRATEGY_MODES,
      // end F-web
      // F-76: animation effects as plain data (no functions).
      mediaAnimationEffects: Object.entries(MEDIA_ANIMATION_EFFECTS).map(
        ([id, { label }]) => ({ id, label }),
      ),
      // end F-76
    };
  },

  async importMedia() {
    return openMediaFilePicker();
  },

  // In web mode, filePath is already a blob: or /samples/ URL — return as-is.
  toFileUrl(filePath) {
    return filePath;
  },

  startExport,
  cancelExport,

  // ── export event subscriptions (renderer → bus) ──────────────────────────
  onExportStatus(listener) {
    return exportBus.on("export-status", listener);
  },
  onExportPrepare(listener) {
    return exportBus.on("export-prepare", listener);
  },
  onExportReset(listener) {
    return exportBus.on("export-reset", listener);
  },
  onRenderExportFrame(listener) {
    return exportBus.on("export-render-frame", listener);
  },
  onExportCancel(listener) {
    return exportBus.on("export-cancelled", listener);
  },

  // ── renderer notifications (renderer → bus) ──────────────────────────────
  notifyExportPrepared(payload = {}) {
    exportBus.notifyFromRenderer("export-prepared", payload);
  },
  notifyExportFrameSettled(payload) {
    exportBus.notifyFromRenderer("export-frame-settled", payload);
  },
  notifyReady(details = {}) {
    console.log("[app-api] renderer ready:", details);
  },
  notifyError(message, details = {}) {
    console.error("[app-api] renderer error:", message, details);
    exportBus.rejectAll(new Error(message));
  },
};
// end F-web
