const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bikeFlyOverApp", {
  notifyReady() {
    ipcRenderer.send("renderer-ready");
  },
  notifyError(message) {
    ipcRenderer.send("renderer-error", message);
  },
});
