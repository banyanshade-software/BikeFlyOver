// F-02: parse binary FIT activity files into the shared trackpoint model used by TCX and GPX parsers.
// fit-file-parser ships as an ES module; the CJS dist wraps the class under `.default`.
const { default: FitParser } = require("fit-file-parser");

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTrackpoint(record) {
  const latitude = toFiniteOrNull(record.position_lat);
  const longitude = toFiniteOrNull(record.position_long);
  const altitude = toFiniteOrNull(record.altitude);

  // fit-file-parser exposes timestamp as a JS Date object.
  const timestamp =
    record.timestamp instanceof Date ? record.timestamp.getTime() : NaN;

  if (
    latitude === null ||
    longitude === null ||
    altitude === null ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  return {
    time: new Date(timestamp).toISOString(),
    timestamp,
    latitude,
    longitude,
    altitude,
    distance: toFiniteOrNull(record.distance),
    heartRate: toFiniteOrNull(record.heart_rate),
    speed: toFiniteOrNull(record.speed),
    cadence: toFiniteOrNull(record.cadence),
    temperature: toFiniteOrNull(record.temperature),
  };
}

function isDuplicateTrackpoint(previous, next) {
  if (!previous) return false;
  return (
    previous.timestamp === next.timestamp &&
    previous.latitude === next.latitude &&
    previous.longitude === next.longitude &&
    previous.altitude === next.altitude
  );
}

/**
 * Parse a binary FIT file buffer into the shared trackpoint array.
 * @param {Buffer} buffer — raw file content from fs.readFile(path) (no encoding).
 * @returns {Array} sorted, deduped trackpoints.
 */
function parseFitTrack(buffer) {
  const parser = new FitParser({
    force: true,
    speedUnit: "m/s",
    lengthUnit: "m",
    temperatureUnit: "celsius",
    elapsedRecordField: false,
    mode: "list",
  });

  let records = [];
  let parseError = null;

  parser.parse(buffer, (error, data) => {
    if (error) {
      parseError = error;
    } else {
      records = Array.isArray(data?.records) ? data.records : [];
    }
  });

  if (parseError) {
    throw new Error(
      `Failed to parse FIT file: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    );
  }

  const normalized = records
    .map(buildTrackpoint)
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp);

  const deduped = normalized.filter((tp, i) =>
    !isDuplicateTrackpoint(i > 0 ? normalized[i - 1] : null, tp),
  );

  if (deduped.length === 0) {
    throw new Error("No valid trackpoints were parsed from the FIT file.");
  }

  return deduped;
}

module.exports = { parseFitTrack };
// end F-02
