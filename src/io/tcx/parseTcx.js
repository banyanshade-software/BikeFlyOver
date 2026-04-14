const { XMLParser } = require("fast-xml-parser");

const tcxParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
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

function buildTrackpoint(rawTrackpoint) {
  const latitude = toNumber(rawTrackpoint?.Position?.LatitudeDegrees);
  const longitude = toNumber(rawTrackpoint?.Position?.LongitudeDegrees);
  const altitude = toNumber(rawTrackpoint?.AltitudeMeters);
  const time = rawTrackpoint?.Time;
  const heartRate = toNumber(rawTrackpoint?.HeartRateBpm?.Value);
  const speed = toNumber(rawTrackpoint?.Extensions?.TPX?.Speed);
  const distance = toNumber(rawTrackpoint?.DistanceMeters);
  const timestamp = Date.parse(time);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(altitude) ||
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
    distance: Number.isFinite(distance) ? distance : null,
    heartRate: Number.isFinite(heartRate) ? heartRate : null,
    speed: Number.isFinite(speed) ? speed : null,
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

function parseTcxTrack(xml) {
  const parsed = tcxParser.parse(xml);
  const activityRoot = parsed?.TrainingCenterDatabase?.Activities?.Activity;
  const laps = asArray(activityRoot?.Lap);
  const rawTrackpoints = laps.flatMap((lap) =>
    asArray(lap?.Track).flatMap((track) => asArray(track?.Trackpoint)),
  );

  const normalizedTrackpoints = rawTrackpoints
    .map(buildTrackpoint)
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);

  return normalizedTrackpoints.filter((trackpoint, index) => {
    return !isDuplicateTrackpoint(
      index > 0 ? normalizedTrackpoints[index - 1] : null,
      trackpoint,
    );
  });
}

function summarizeTrackpoints(trackpoints) {
  if (trackpoints.length === 0) {
    throw new Error("No valid trackpoints were parsed from the TCX file.");
  }

  const firstTrackpoint = trackpoints[0];
  const lastTrackpoint = trackpoints[trackpoints.length - 1];

  const bounds = trackpoints.reduce(
    (accumulator, trackpoint) => ({
      minLatitude: Math.min(accumulator.minLatitude, trackpoint.latitude),
      maxLatitude: Math.max(accumulator.maxLatitude, trackpoint.latitude),
      minLongitude: Math.min(accumulator.minLongitude, trackpoint.longitude),
      maxLongitude: Math.max(accumulator.maxLongitude, trackpoint.longitude),
      minAltitude: Math.min(accumulator.minAltitude, trackpoint.altitude),
      maxAltitude: Math.max(accumulator.maxAltitude, trackpoint.altitude),
    }),
    {
      minLatitude: firstTrackpoint.latitude,
      maxLatitude: firstTrackpoint.latitude,
      minLongitude: firstTrackpoint.longitude,
      maxLongitude: firstTrackpoint.longitude,
      minAltitude: firstTrackpoint.altitude,
      maxAltitude: firstTrackpoint.altitude,
    },
  );

  return {
    pointCount: trackpoints.length,
    startTime: firstTrackpoint.time,
    endTime: lastTrackpoint.time,
    durationSeconds: Math.max(
      0,
      Math.round((lastTrackpoint.timestamp - firstTrackpoint.timestamp) / 1000),
    ),
    bounds,
  };
}

module.exports = {
  parseTcxTrack,
  summarizeTrackpoints,
};
