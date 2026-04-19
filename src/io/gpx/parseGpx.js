// F-167: GPX activity file parser.
// Produces the same normalized trackpoint model as parseTcx so the rest of the
// app can treat TCX and GPX tracks interchangeably.
const { XMLParser } = require("fast-xml-parser");
const { summarizeTrackpoints } = require("../tcx/parseTcx");

const gpxParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",   // lat/lon come through as plain keys
  removeNSPrefix: true,      // strip gpxtpx:, ns3:, etc.
  parseTagValue: true,
  trimValues: true,
});

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function toNumber(value) {
  return typeof value === "number" ? value : Number(value);
}

function buildTrackpoint(rawTrkpt) {
  const latitude = toNumber(rawTrkpt?.lat);
  const longitude = toNumber(rawTrkpt?.lon);
  const altitude = toNumber(rawTrkpt?.ele);
  const time = rawTrkpt?.time;
  const timestamp = time ? Date.parse(time) : NaN;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(altitude) ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  // Garmin TrackPointExtension fields — namespace prefix is stripped by the parser.
  const ext = rawTrkpt?.extensions?.TrackPointExtension;
  const heartRate = toNumber(ext?.hr);
  const cadence = toNumber(ext?.cad);
  const speed = toNumber(ext?.speed);
  const temperature = toNumber(ext?.atemp ?? ext?.temp);

  return {
    time: new Date(timestamp).toISOString(),
    timestamp,
    latitude,
    longitude,
    altitude,
    distance: null,
    heartRate: Number.isFinite(heartRate) ? heartRate : null,
    speed: Number.isFinite(speed) ? speed : null,
    cadence: Number.isFinite(cadence) ? cadence : null,
    temperature: Number.isFinite(temperature) ? temperature : null,
  };
}

function isDuplicateTrackpoint(previousTrackpoint, nextTrackpoint) {
  if (!previousTrackpoint) {
    return false;
  }

  return (
    previousTrackpoint.timestamp === nextTrackpoint.timestamp &&
    previousTrackpoint.latitude === nextTrackpoint.latitude &&
    previousTrackpoint.longitude === nextTrackpoint.longitude &&
    previousTrackpoint.altitude === nextTrackpoint.altitude
  );
}

function parseGpxTrack(xml) {
  const parsed = gpxParser.parse(xml);
  const tracks = asArray(parsed?.gpx?.trk);

  // Collect every raw trkpt across all trk/trkseg elements.
  const rawTrkpts = tracks.flatMap((trk) =>
    asArray(trk?.trkseg).flatMap((seg) => asArray(seg?.trkpt)),
  );

  if (rawTrkpts.length > 0) {
    const hasAnyTime = rawTrkpts.some((pt) => pt?.time != null);
    if (!hasAnyTime) {
      throw new Error(
        "No timestamped trackpoints found in the GPX file. " +
          "Route files cannot be used as activity input.",
      );
    }
  }

  const normalizedTrackpoints = rawTrkpts
    .map(buildTrackpoint)
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);

  if (normalizedTrackpoints.length === 0) {
    throw new Error("No valid trackpoints were parsed from the GPX file.");
  }

  return normalizedTrackpoints.filter((trackpoint, index) => {
    return !isDuplicateTrackpoint(
      index > 0 ? normalizedTrackpoints[index - 1] : null,
      trackpoint,
    );
  });
}

module.exports = {
  parseGpxTrack,
  // Re-export so callers can import from a single place without coupling to TCX.
  summarizeTrackpoints,
};
// end F-167
