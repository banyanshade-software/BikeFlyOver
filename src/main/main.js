const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const isSmokeTest = process.argv.includes("--smoke-test");

if (isSmokeTest) {
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
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

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  return mainWindow;
}

app.whenReady().then(() => {
  ipcMain.once("renderer-ready", () => {
    console.log("BikeFlyOver renderer ready.");

    if (isSmokeTest) {
      setTimeout(() => {
        app.quit();
      }, 500);
    }
  });

  ipcMain.on("renderer-error", (_event, message) => {
    console.error(`Renderer initialization failed: ${message}`);

    if (isSmokeTest) {
      app.exit(1);
    }
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
