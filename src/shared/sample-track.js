const path = require("node:path");
const fs = require("node:fs/promises");
const { parseTcxTrack, summarizeTrackpoints } = require("../io/tcx/parseTcx");
const { parseGpxTrack } = require("../io/gpx/parseGpx");

function getSampleTrackPath() {
  return path.join(__dirname, "../../samples/activity.tcx");
}

// F-167: generic loader that dispatches to the correct parser by file extension.
async function loadActivityFile(filePath) {
  const xml = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const trackpoints = ext === ".gpx" ? parseGpxTrack(xml) : parseTcxTrack(xml);
  const summary = summarizeTrackpoints(trackpoints);

  return {
    fileName: path.basename(filePath),
    filePath,
    trackpoints,
    summary,
  };
}
// end F-167

async function loadSampleTrack() {
  const samplePath = getSampleTrackPath();
  const result = await loadActivityFile(samplePath);

  return {
    ...result,
    samplePath,
  };
}

module.exports = {
  getSampleTrackPath,
  loadActivityFile,
  loadSampleTrack,
};
