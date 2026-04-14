const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const ffmpegPath = require("ffmpeg-static");
const { loadSampleTrack } = require("../shared/sample-track");
const {
  detectMediaType,
  extractMediaTimestampMetadata,
} = require("../shared/media-metadata");
const {
  EXPORT_DEFAULTS,
  EXPORT_TIMING_MODES,
  buildExportTimeline,
  computeExportFrameCount,
  formatFrameFileName,
  getExportFrameState,
  normalizeExportSettings,
} = require("../shared/export");

const isSmokeTest = process.argv.includes("--smoke-test");
const rendererPath = path.join(__dirname, "../renderer/index.html");

let mainWindow = null;
let activeExportSession = null;

function getTimingModeLabel(timingMode) {
  return (
    EXPORT_TIMING_MODES.find((mode) => mode.id === timingMode)?.label || timingMode
  );
}

if (isSmokeTest) {
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
}

function createDeferred() {
  let resolve;
  let reject;

  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function ownsActiveExport(webContents) {
  return activeExportSession?.ownerWebContents === webContents;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#06121d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      console.error(
        `Renderer failed to load (${errorCode}): ${errorDescription}`,
      );

      if (isSmokeTest) {
        app.exit(1);
      }
    },
  );

  void mainWindow.loadFile(rendererPath, {
    query: {
      mode: "preview",
    },
  });

  return mainWindow;
}

function emitExportStatus(payload) {
  mainWindow?.webContents.send("export-status", payload);
}

async function normalizeImportedMediaPaths(filePaths) {
  const importedMedia = await Promise.all(
    filePaths.map(async (filePath) => {
      const mediaType = detectMediaType(filePath);

      if (!mediaType) {
        return null;
      }

      const timestampMetadata = await extractMediaTimestampMetadata(
        filePath,
        mediaType,
      );

      return {
        id: randomUUID(),
        filePath,
        fileName: path.basename(filePath),
        mediaType,
        ...timestampMetadata,
      };
    }),
  );

  return importedMedia.filter(Boolean);
}

async function importMediaFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import photos and videos",
    buttonLabel: "Import media",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: ["jpg", "jpeg", "png", "heic", "mp4", "mov"],
      },
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "heic"],
      },
      {
        name: "Videos",
        extensions: ["mp4", "mov"],
      },
    ],
  });

  if (result.canceled) {
    return {
      cancelled: true,
      mediaItems: [],
    };
  }

  return {
    cancelled: false,
    mediaItems: await normalizeImportedMediaPaths(result.filePaths),
  };
}

async function promptForExportPath(sampleTrack) {
  const defaultFileName = `${path.basename(
    sampleTrack.fileName,
    path.extname(sampleTrack.fileName),
  )}.mp4`;
  const defaultPath = path.join(app.getPath("videos"), defaultFileName);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export MP4",
    defaultPath,
    filters: [
      {
        name: "MP4 video",
        extensions: ["mp4"],
      },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return result.filePath;
}

async function encodeFramesToMp4(session) {
  if (!ffmpegPath) {
    throw new Error("Bundled ffmpeg binary is unavailable.");
  }

  const framePattern = path.join(session.tempDir, "frame-%06d.png");

  await new Promise((resolve, reject) => {
    const stderrChunks = [];
    const ffmpeg = spawn(
      ffmpegPath,
      [
        "-y",
        "-framerate",
        String(session.settings.fps),
        "-i",
        framePattern,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        session.outputPath,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
      },
    );

    ffmpeg.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(
        new Error(
          stderr || `ffmpeg exited with a non-zero status code (${code}).`,
        ),
      );
    });
  });
}

async function prepareMainWindowForExport(session) {
  if (!mainWindow) {
    throw new Error("Main window is unavailable for export.");
  }

  const [minWidth, minHeight] = mainWindow.getMinimumSize();
  session.originalWindowState = {
    bounds: mainWindow.getBounds(),
    isMaximized: mainWindow.isMaximized(),
    minHeight,
    minWidth,
  };

  if (session.originalWindowState.isMaximized) {
    mainWindow.unmaximize();
  }

  mainWindow.setMinimumSize(0, 0);
  mainWindow.setContentSize(session.settings.width, session.settings.height);
  session.exportPreparedDeferred = createDeferred();
  mainWindow.webContents.send("export-prepare", {
    settings: session.settings,
  });
  await session.exportPreparedDeferred.promise;
}

async function restoreMainWindowAfterExport(session) {
  if (!mainWindow || !session.originalWindowState) {
    return;
  }

  mainWindow.setMinimumSize(
    session.originalWindowState.minWidth,
    session.originalWindowState.minHeight,
  );

  if (session.originalWindowState.isMaximized) {
    mainWindow.maximize();
  } else {
    mainWindow.setBounds(session.originalWindowState.bounds);
  }

  mainWindow.webContents.send("export-reset");
}

async function captureExportFrame(session, frameNumber) {
  const image = await mainWindow.webContents.capturePage();
  const normalizedImage = image.resize({
    width: session.settings.width,
    height: session.settings.height,
    quality: "good",
  });
  const framePath = path.join(session.tempDir, formatFrameFileName(frameNumber));

  await fs.writeFile(framePath, normalizedImage.toPNG());
}

async function renderExportFrame(session, frameIndex) {
  for (
    let attemptIndex = 0;
    attemptIndex <= session.settings.maxFrameRetries;
    attemptIndex += 1
  ) {
    if (session.cancelRequested) {
      throw new Error("Export cancelled.");
    }

    const frameState = getExportFrameState({
      exportTimeline: session.exportTimeline,
      frameIndex,
      fps: session.settings.fps,
    });

    session.frameSettledDeferred = createDeferred();
    session.expectedFrameIndex = frameIndex;
    mainWindow.webContents.send("export-render-frame", {
      activeMedia: frameState.activeMedia,
      frameIndex,
      totalFrames: session.totalFrames,
      activityTimestamp: frameState.activityTimestamp,
      settings: session.settings,
    });

    try {
      await session.frameSettledDeferred.promise;
      await captureExportFrame(session, frameIndex + 1);
      return;
    } catch (error) {
      if (attemptIndex >= session.settings.maxFrameRetries) {
        throw error;
      }
    } finally {
      session.frameSettledDeferred = null;
    }
  }
}

async function finalizeExportSession(session, { preserveFrames }) {
  try {
    await restoreMainWindowAfterExport(session);
  } finally {
    if (!preserveFrames) {
      await fs.rm(session.tempDir, {
        force: true,
        recursive: true,
      });
    }

    if (activeExportSession === session) {
      activeExportSession = null;
    }
  }
}

async function runExportSession(session) {
  emitExportStatus({
    status: "starting",
    phase: "preparing",
    message: `Preparing ${session.totalFrames} frames at ${session.settings.width}x${session.settings.height} using ${getTimingModeLabel(session.settings.timingMode)}.`,
    currentFrame: 0,
    totalFrames: session.totalFrames,
  });

  try {
    await prepareMainWindowForExport(session);

    for (let frameIndex = 0; frameIndex < session.totalFrames; frameIndex += 1) {
      await renderExportFrame(session, frameIndex);
      session.lastCompletedFrame = frameIndex + 1;
      emitExportStatus({
        status: "running",
        phase: "rendering",
        message: `Rendered frame ${frameIndex + 1} of ${session.totalFrames}.`,
        currentFrame: frameIndex + 1,
        totalFrames: session.totalFrames,
      });
    }

    emitExportStatus({
      status: "encoding",
      phase: "encoding",
      message: "Encoding PNG frames into MP4 with bundled ffmpeg.",
      currentFrame: session.totalFrames,
      totalFrames: session.totalFrames,
    });
    await encodeFramesToMp4(session);
    emitExportStatus({
      status: "complete",
      phase: "complete",
      message: `Exported MP4 to ${session.outputPath}.`,
      currentFrame: session.totalFrames,
      totalFrames: session.totalFrames,
      outputPath: session.outputPath,
    });
    await finalizeExportSession(session, {
      preserveFrames: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = session.cancelRequested ? "cancelled" : "failed";
    const phase = status === "cancelled" ? "cancelled" : "error";

    emitExportStatus({
      status,
      phase,
      message:
        status === "cancelled"
          ? `Export cancelled. Preserved frames in ${session.tempDir}.`
          : `${message} Preserved frames in ${session.tempDir}.`,
      currentFrame: session.lastCompletedFrame,
      totalFrames: session.totalFrames,
      outputPath: session.outputPath,
      tempDir: session.tempDir,
    });
    await finalizeExportSession(session, {
      preserveFrames: true,
    });
  }
}

async function startExport(settings) {
  if (activeExportSession) {
    throw new Error("An export session is already running.");
  }

  const mediaItems = Array.isArray(settings?.mediaItems) ? settings.mediaItems : [];
  const normalizedSettings = normalizeExportSettings({
    ...EXPORT_DEFAULTS,
    ...settings,
  });
  const sampleTrack = await loadSampleTrack();
  const outputPath = await promptForExportPath(sampleTrack);

  if (!outputPath) {
    return {
      started: false,
      cancelled: true,
    };
  }

  const trackpoints = sampleTrack.trackpoints;
  const exportTimeline = buildExportTimeline({
    mediaItems,
    trackpoints,
    settings: normalizedSettings,
  });
  const totalFrames = computeExportFrameCount({
    exportTimeline,
    fps: normalizedSettings.fps,
  });
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "bikeflyover-export-"),
  );
  const session = {
    cancelRequested: false,
    expectedFrameIndex: -1,
    exportPreparedDeferred: null,
    exportTimeline,
    frameSettledDeferred: null,
    lastCompletedFrame: 0,
    originalWindowState: null,
    outputPath,
    ownerWebContents: mainWindow?.webContents || null,
    sampleTrack,
    settings: normalizedSettings,
    tempDir,
    totalFrames,
  };

  activeExportSession = session;
  void runExportSession(session);

  return {
    started: true,
    outputPath,
    totalFrames,
    settings: normalizedSettings,
  };
}

app.whenReady().then(() => {
  ipcMain.on("renderer-ready", () => {
    console.log("BikeFlyOver renderer ready.");

    if (isSmokeTest) {
      setTimeout(() => {
        app.quit();
      }, 500);
    }
  });

  ipcMain.on("renderer-error", (event, payload) => {
    const details =
      typeof payload === "string" ? { message: payload } : payload || {};

    console.error(`Renderer initialization failed: ${details.message}`);

    if (isSmokeTest) {
      app.exit(1);
      return;
    }

    if (ownsActiveExport(event.sender)) {
      const error = new Error(details.message || "Export renderer failed.");
      activeExportSession.exportPreparedDeferred?.reject(error);
      activeExportSession.frameSettledDeferred?.reject(error);
    }
  });

  ipcMain.on("export-prepared", (event) => {
    if (ownsActiveExport(event.sender) && activeExportSession?.exportPreparedDeferred) {
      activeExportSession.exportPreparedDeferred.resolve();
    }
  });

  ipcMain.on("export-frame-settled", (event, payload) => {
    if (!ownsActiveExport(event.sender) || !activeExportSession?.frameSettledDeferred) {
      return;
    }

    if (payload?.frameIndex !== activeExportSession.expectedFrameIndex) {
      activeExportSession.frameSettledDeferred.reject(
        new Error(
          `Received settled frame ${payload?.frameIndex} while waiting for frame ${activeExportSession.expectedFrameIndex}.`,
        ),
      );
      return;
    }

    activeExportSession.frameSettledDeferred.resolve(payload);
  });

  ipcMain.handle("export-start", async (_event, settings) => {
    return startExport(settings);
  });

  ipcMain.handle("media-import", async () => {
    return importMediaFiles();
  });

  ipcMain.handle("export-cancel", async () => {
    if (!activeExportSession) {
      return {
        cancelled: false,
      };
    }

    activeExportSession.cancelRequested = true;
    mainWindow?.webContents.send("export-cancelled");
    activeExportSession.exportPreparedDeferred?.reject(
      new Error("Export cancelled."),
    );
    activeExportSession.frameSettledDeferred?.reject(
      new Error("Export cancelled."),
    );

    return {
      cancelled: true,
    };
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
