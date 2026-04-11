const path = require("node:path");
const fs = require("node:fs/promises");
const { contextBridge, ipcRenderer } = require("electron");
const {
  parseTcxTrack,
  summarizeTrackpoints,
} = require("../io/tcx/parseTcx");

contextBridge.exposeInMainWorld("bikeFlyOverApp", {
  async loadSampleTrack() {
    const samplePath = path.join(
      __dirname,
      "../../samples/activity_22469836126.tcx",
    );
    const xml = await fs.readFile(samplePath, "utf8");
    const trackpoints = parseTcxTrack(xml);
    const summary = summarizeTrackpoints(trackpoints);

    return {
      fileName: path.basename(samplePath),
      samplePath,
      trackpoints,
      summary,
    };
  },
  notifyReady() {
    ipcRenderer.send("renderer-ready");
  },
  notifyError(message) {
    ipcRenderer.send("renderer-error", message);
  },
});
