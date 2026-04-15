const path = require("node:path");
const fs = require("node:fs/promises");
const {
  parseTcxTrack,
  summarizeTrackpoints,
} = require("../io/tcx/parseTcx");

function getSampleTrackPath() {
  return path.join(__dirname, "../../samples/activity.tcx");
}

async function loadSampleTrack() {
  const samplePath = getSampleTrackPath();
  const xml = await fs.readFile(samplePath, "utf8");
  const trackpoints = parseTcxTrack(xml);
  const summary = summarizeTrackpoints(trackpoints);

  return {
    fileName: path.basename(samplePath),
    samplePath,
    trackpoints,
    summary,
  };
}

module.exports = {
  getSampleTrackPath,
  loadSampleTrack,
};
