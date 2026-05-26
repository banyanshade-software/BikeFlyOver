const path = require("node:path");
const fs = require("node:fs/promises");
const { parseTcxTrack, summarizeTrackpoints } = require("../io/tcx/parseTcx");
const { parseGpxTrack } = require("../io/gpx/parseGpx");
// F-02: import the FIT parser so .fit files can be loaded alongside TCX and GPX.
const { parseFitTrack } = require("../io/fit/parseFit");
// end F-02

function getSampleTrackPath() {
  return path.join(__dirname, "../../samples/activity.tcx");
}

function getSampleGpxPath() {
  return path.join(__dirname, "../../samples/activity.gpx");
}

// F-167: generic loader that dispatches to the correct parser by file extension.
// F-02: extended to handle binary .fit files via parseFitTrack.
async function loadActivityFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let trackpoints;
  if (ext === ".fit") {
    // F-02: FIT is binary — read without text encoding.
    const buffer = await fs.readFile(filePath);
    trackpoints = parseFitTrack(buffer);
  } else {
    const xml = await fs.readFile(filePath, "utf8");
    trackpoints = ext === ".gpx" ? parseGpxTrack(xml) : parseTcxTrack(xml);
  }
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
  // Try the canonical TCX first; fall back to GPX if it doesn't exist.
  let samplePath = getSampleTrackPath();
  console.debug(`[sample-track] trying ${samplePath}`);
  try {
    await fs.access(samplePath);
  } catch {
    samplePath = getSampleGpxPath();
    console.debug(`[sample-track] TCX not found, falling back to ${samplePath}`);
  }

  console.debug(`[sample-track] loading ${samplePath}`);
  const result = await loadActivityFile(samplePath);
  console.debug(
    `[sample-track] loaded ${result.fileName}: ${result.summary.pointCount} points, ` +
      `${result.summary.durationSeconds}s`,
  );

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
