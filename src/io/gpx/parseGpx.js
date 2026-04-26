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

// Fixed speed used to synthesize timestamps for route GPX files that have no <time>.
const ROUTE_SPEED_MS = 20000 / 3600; // 20 km/h in m/s
// Synthetic timeline origin for route files (arbitrary but human-readable).
const ROUTE_SYNTHETIC_ORIGIN_MS = Date.parse("2000-01-01T00:00:00Z");

const EARTH_RADIUS_M = 6371000;

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

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// Haversine great-circle distance in metres between two lat/lon pairs.
function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.asin(Math.sqrt(a));
}

// Build synthetic timestamps and cumulative distances for route GPX files that
// have no <time> elements. Uses a fixed speed of 20 km/h so the flyover renders
// at a sensible pace.
function synthesizeTimestamps(rawTrkpts) {
  const result = [];
  let cumulativeMs = 0;
  let cumulativeDistM = 0;
  let prevLat = null;
  let prevLon = null;

  for (const pt of rawTrkpts) {
    const latitude = toNumber(pt?.lat);
    const longitude = toNumber(pt?.lon);
    const altitude = toNumber(pt?.ele);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(altitude)) {
      continue;
    }

    if (prevLat !== null) {
      const dist = haversineDistanceM(prevLat, prevLon, latitude, longitude);
      cumulativeMs += (dist / ROUTE_SPEED_MS) * 1000;
      cumulativeDistM += dist;
    }

    const timestamp = ROUTE_SYNTHETIC_ORIGIN_MS + Math.round(cumulativeMs);
    result.push({ latitude, longitude, altitude, timestamp, distance: cumulativeDistM });
    prevLat = latitude;
    prevLon = longitude;
  }

  return result;
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

  const hasAnyTime = rawTrkpts.some((pt) => pt?.time != null);

  let normalizedTrackpoints;

  if (!hasAnyTime) {
    // Route GPX without timestamps: synthesize a timeline at 20 km/h.
    const synthetic = synthesizeTimestamps(rawTrkpts);
    normalizedTrackpoints = synthetic.map(({ latitude, longitude, altitude, timestamp, distance }) => ({
      time: new Date(timestamp).toISOString(),
      timestamp,
      latitude,
      longitude,
      altitude,
      distance,
      heartRate: null,
      speed: null,
      cadence: null,
      temperature: null,
    }));
  } else {
    normalizedTrackpoints = rawTrkpts
      .map(buildTrackpoint)
      .filter(Boolean)
      .sort((left, right) => left.timestamp - right.timestamp);
  }

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
  // Exported for testing.
  ROUTE_SPEED_MS,
  ROUTE_SYNTHETIC_ORIGIN_MS,
};
// end F-167
