// F-web: Web export engine — MediaRecorder (real-time) and ffmpeg.wasm (frame-by-frame) strategies.
// This module runs in the same JS process as the renderer, so IPC is replaced by direct callbacks
// through the shared ExportBus instance created by app-api.js.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import {
  buildExportTimeline,
  computeExportFrameCount,
  getExportFrameState,
} from "../shared/export.js";

// ── utilities ────────────────────────────────────────────────────────────────

function rAF() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function formatFrameName(n) {
  return `frame-${String(n).padStart(6, "0")}.png`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function getCesiumCanvas() {
  return document.querySelector("#cesiumContainer canvas");
}

function capturePng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Canvas capture returned null.")),
      "image/png",
    );
  });
}

// ── ExportBus ────────────────────────────────────────────────────────────────
// Central event channel between app-api.js and the export engine.
// • emit() — engine → renderer (drives render-frame, export-prepare, etc.)
// • on() — renderer subscribes to engine events (via window.bikeFlyOverApp.onXxx)
// • notifyFromRenderer() — renderer → engine (notifyExportPrepared, notifyFrameSettled)
// • waitFor() — engine awaits a renderer notification

export class ExportBus {
  constructor() {
    this._listeners = {};
    this._pendingWaits = {};
    this.cancelRequested = false;
  }

  emit(channel, payload) {
    const fns = this._listeners[channel];
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[export-bus] listener error on "${channel}":`, e);
      }
    }
  }

  on(channel, fn) {
    (this._listeners[channel] ??= []).push(fn);
    return () => {
      this._listeners[channel] = (this._listeners[channel] ?? []).filter(
        (f) => f !== fn,
      );
    };
  }

  waitFor(channel) {
    return new Promise((resolve, reject) => {
      this._pendingWaits[channel] = { resolve, reject };
    });
  }

  notifyFromRenderer(channel, payload) {
    const pending = this._pendingWaits[channel];
    if (pending) {
      delete this._pendingWaits[channel];
      pending.resolve(payload);
    }
  }

  rejectAll(error) {
    for (const pending of Object.values(this._pendingWaits)) {
      pending.reject(error);
    }
    this._pendingWaits = {};
  }

  reset() {
    this.cancelRequested = false;
    this._pendingWaits = {};
  }
}

// ── shared frame-loop ────────────────────────────────────────────────────────
// Drives the renderer through frame-by-frame export. Returns frames as an array
// of PNG Blobs (for ffmpeg.wasm) or undefined (for MediaRecorder, where the canvas
// stream captures automatically).

async function runFrameLoop(bus, settings, exportTimeline, totalFrames, captureFrame) {
  // Prepare phase: tell the renderer to stop playback, apply settings, and settle.
  const prepareWait = bus.waitFor("export-prepared");
  bus.emit("export-prepare", { settings });
  await prepareWait;

  const frames = [];

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (bus.cancelRequested) {
      bus.emit("export-cancelled", {});
      bus.emit("export-reset", {});
      throw new Error("Export cancelled.");
    }

    const frameState = getExportFrameState({
      exportTimeline,
      frameIndex,
      fps: settings.fps,
    });

    const settledWait = bus.waitFor("export-frame-settled");
    bus.emit("export-render-frame", {
      activeMedia: frameState.activeMedia,
      frameIndex,
      totalFrames,
      activityTimestamp: frameState.activityTimestamp,
      settings,
    });
    await settledWait;

    if (captureFrame) {
      // Two rAFs ensure the WebGL canvas is flushed before capture.
      await rAF();
      await rAF();
      const blob = await captureFrame();
      frames.push(blob);
    } else {
      await rAF();
    }

    bus.emit("export-status", {
      status: "running",
      phase: "rendering",
      message: `Rendered frame ${frameIndex + 1} of ${totalFrames}.`,
      currentFrame: frameIndex + 1,
      totalFrames,
    });
  }

  return frames;
}

// ── MediaRecorder strategy ───────────────────────────────────────────────────

async function runMediaRecorderExport(settings, trackpoints, bus) {
  const canvas = getCesiumCanvas();
  if (!canvas) throw new Error("Cesium canvas not found.");

  const exportTimeline = buildExportTimeline({
    mediaItems: settings.mediaItems ?? [],
    trackpoints,
    settings,
  });
  const totalFrames = computeExportFrameCount({
    exportTimeline,
    fps: settings.fps,
  });

  bus.emit("export-status", {
    status: "starting",
    phase: "preparing",
    message: `Preparing ${totalFrames} frames (MediaRecorder / real-time).`,
    currentFrame: 0,
    totalFrames,
  });

  // Resize canvas to export dimensions before starting the stream.
  canvas.width = settings.width;
  canvas.height = settings.height;

  const stream = canvas.captureStream(settings.fps);
  const mimeTypes = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  const mimeType =
    mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(200);

  try {
    await runFrameLoop(bus, settings, exportTimeline, totalFrames, null);
  } finally {
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
  }

  bus.emit("export-status", {
    status: "encoding",
    phase: "encoding",
    message: "Finalising recording…",
    currentFrame: totalFrames,
    totalFrames,
  });

  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  triggerDownload(blob, `bikeflyover-export.${ext}`);

  bus.emit("export-status", {
    status: "complete",
    phase: "complete",
    message: "Download started.",
    currentFrame: totalFrames,
    totalFrames,
  });

  bus.emit("export-reset", {});
}

// ── ffmpeg.wasm strategy ─────────────────────────────────────────────────────

async function runFfmpegWasmExport(settings, trackpoints, bus) {
  const canvas = getCesiumCanvas();
  if (!canvas) throw new Error("Cesium canvas not found.");

  const exportTimeline = buildExportTimeline({
    mediaItems: settings.mediaItems ?? [],
    trackpoints,
    settings,
  });
  const totalFrames = computeExportFrameCount({
    exportTimeline,
    fps: settings.fps,
  });

  bus.emit("export-status", {
    status: "starting",
    phase: "preparing",
    message: `Preparing ${totalFrames} frames (ffmpeg.wasm / frame-by-frame).`,
    currentFrame: 0,
    totalFrames,
  });

  canvas.width = settings.width;
  canvas.height = settings.height;

  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    bus.emit("export-status", {
      status: "encoding",
      phase: "encoding",
      message: `Encoding… ${Math.round(progress * 100)}%`,
      currentFrame: totalFrames,
      totalFrames,
    });
  });

  bus.emit("export-status", {
    status: "starting",
    phase: "loading-ffmpeg",
    message: "Loading ffmpeg.wasm…",
    currentFrame: 0,
    totalFrames,
  });

  await ffmpeg.load();

  const frames = await runFrameLoop(
    bus,
    settings,
    exportTimeline,
    totalFrames,
    () => capturePng(canvas),
  );

  bus.emit("export-status", {
    status: "encoding",
    phase: "encoding",
    message: `Writing ${frames.length} PNG frames…`,
    currentFrame: totalFrames,
    totalFrames,
  });

  for (let i = 0; i < frames.length; i++) {
    const data = new Uint8Array(await frames[i].arrayBuffer());
    await ffmpeg.writeFile(formatFrameName(i + 1), data);
  }

  await ffmpeg.exec([
    "-y",
    "-framerate",
    String(settings.fps),
    "-i",
    "frame-%06d.png",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "output.mp4",
  ]);

  const data = await ffmpeg.readFile("output.mp4");
  ffmpeg.terminate();

  const blob = new Blob([data], { type: "video/mp4" });
  triggerDownload(blob, "bikeflyover-export.mp4");

  bus.emit("export-status", {
    status: "complete",
    phase: "complete",
    message: "Download started (MP4).",
    currentFrame: totalFrames,
    totalFrames,
  });

  bus.emit("export-reset", {});
}

// ── public entry points ──────────────────────────────────────────────────────

let _activeBus = null;

export async function startWebExport(settings, trackpoints, bus) {
  if (_activeBus) {
    throw new Error("An export is already in progress.");
  }
  _activeBus = bus;
  bus.reset();

  try {
    const strategy = settings.exportStrategy ?? "media-recorder";

    if (strategy === "ffmpeg-wasm") {
      await runFfmpegWasmExport(settings, trackpoints, bus);
    } else {
      await runMediaRecorderExport(settings, trackpoints, bus);
    }
  } catch (error) {
    if (bus.cancelRequested) {
      bus.emit("export-status", {
        status: "cancelled",
        phase: "cancelled",
        message: "Export cancelled.",
        currentFrame: 0,
        totalFrames: 0,
      });
      bus.emit("export-cancelled", {});
      bus.emit("export-reset", {});
    } else {
      const message = error instanceof Error ? error.message : String(error);
      bus.emit("export-status", {
        status: "failed",
        phase: "error",
        message,
        currentFrame: 0,
        totalFrames: 0,
      });
      bus.emit("export-reset", {});
    }
  } finally {
    _activeBus = null;
    bus.rejectAll(new Error("Export session ended."));
  }
}

export function cancelWebExport() {
  if (_activeBus) {
    _activeBus.cancelRequested = true;
    _activeBus.rejectAll(new Error("Export cancelled."));
  }
}
// end F-web
