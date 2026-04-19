const test = require("node:test");
const assert = require("node:assert/strict");
const { parseGpxTrack, summarizeTrackpoints } = require("../src/io/gpx/parseGpx");

// Minimal valid GPX activity with timestamps and all extension fields.
const FULL_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"
     version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="46.1002" lon="6.2002">
        <ele>420</ele>
        <time>2024-01-01T10:00:10Z</time>
      </trkpt>
      <trkpt lat="46.1001" lon="6.2001">
        <ele>410</ele>
        <time>2024-01-01T10:00:05Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>140</gpxtpx:hr>
            <gpxtpx:cad>80</gpxtpx:cad>
            <gpxtpx:speed>8.5</gpxtpx:speed>
            <gpxtpx:atemp>17</gpxtpx:atemp>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
      <!-- duplicate of the second point above — should be removed -->
      <trkpt lat="46.1001" lon="6.2001">
        <ele>410</ele>
        <time>2024-01-01T10:00:05Z</time>
      </trkpt>
      <!-- invalid: no time — should be dropped -->
      <trkpt lat="46.1003" lon="6.2003">
        <ele>430</ele>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

test("parseGpxTrack sorts, filters invalid points, and removes duplicates", () => {
  const trackpoints = parseGpxTrack(FULL_GPX);

  // Sorted, deduplicated: only 2 valid timestamped non-duplicate points.
  assert.equal(trackpoints.length, 2);
  assert.deepEqual(
    trackpoints.map((tp) => tp.timestamp),
    [
      Date.parse("2024-01-01T10:00:05Z"),
      Date.parse("2024-01-01T10:00:10Z"),
    ],
  );

  const first = trackpoints[0];
  assert.equal(first.latitude, 46.1001);
  assert.equal(first.longitude, 6.2001);
  assert.equal(first.altitude, 410);
  assert.equal(first.distance, null);
  assert.equal(first.heartRate, 140);
  assert.equal(first.cadence, 80);
  assert.equal(first.speed, 8.5);
  assert.equal(first.temperature, 17);

  const second = trackpoints[1];
  assert.equal(second.heartRate, null);
  assert.equal(second.speed, null);
});

test("parseGpxTrack returns null for missing optional metrics", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk><trkseg>
    <trkpt lat="46.1" lon="6.2"><ele>400</ele><time>2024-01-01T10:00:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;

  const trackpoints = parseGpxTrack(xml);
  assert.equal(trackpoints.length, 1);
  assert.equal(trackpoints[0].heartRate, null);
  assert.equal(trackpoints[0].speed, null);
  assert.equal(trackpoints[0].cadence, null);
  assert.equal(trackpoints[0].temperature, null);
  assert.equal(trackpoints[0].distance, null);
});

test("parseGpxTrack flattens multiple trkseg within one trk", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="46.1" lon="6.2"><ele>400</ele><time>2024-01-01T10:00:01Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="46.2" lon="6.3"><ele>410</ele><time>2024-01-01T10:00:02Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const trackpoints = parseGpxTrack(xml);
  assert.equal(trackpoints.length, 2);
  assert.equal(trackpoints[0].latitude, 46.1);
  assert.equal(trackpoints[1].latitude, 46.2);
});

test("parseGpxTrack flattens multiple trk elements", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="46.1" lon="6.2"><ele>400</ele><time>2024-01-01T10:00:01Z</time></trkpt>
    </trkseg>
  </trk>
  <trk>
    <trkseg>
      <trkpt lat="47.1" lon="7.2"><ele>500</ele><time>2024-01-01T10:00:02Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

  const trackpoints = parseGpxTrack(xml);
  assert.equal(trackpoints.length, 2);
  assert.equal(trackpoints[1].latitude, 47.1);
});

test("parseGpxTrack throws for route GPX with no timestamps", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk><trkseg>
    <trkpt lat="46.1" lon="6.2"><ele>400</ele></trkpt>
    <trkpt lat="46.2" lon="6.3"><ele>410</ele></trkpt>
  </trkseg></trk>
</gpx>`;

  assert.throws(
    () => parseGpxTrack(xml),
    /Route files cannot be used as activity input/,
  );
});

test("parseGpxTrack throws for empty or all-invalid GPX", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1">
  <trk><trkseg></trkseg></trk>
</gpx>`;

  assert.throws(
    () => parseGpxTrack(xml),
    /No valid trackpoints were parsed from the GPX file/,
  );
});

test("summarizeTrackpoints re-export from parseGpx matches expected output", () => {
  const trackpoints = [
    {
      altitude: 410,
      latitude: 46.1001,
      longitude: 6.2001,
      time: "2024-01-01T10:00:05.000Z",
      timestamp: Date.parse("2024-01-01T10:00:05Z"),
    },
    {
      altitude: 420,
      latitude: 46.1002,
      longitude: 6.2002,
      time: "2024-01-01T10:00:10.000Z",
      timestamp: Date.parse("2024-01-01T10:00:10Z"),
    },
  ];

  assert.deepEqual(summarizeTrackpoints(trackpoints), {
    bounds: {
      maxAltitude: 420,
      maxLatitude: 46.1002,
      maxLongitude: 6.2002,
      minAltitude: 410,
      minLatitude: 46.1001,
      minLongitude: 6.2001,
    },
    durationSeconds: 5,
    endTime: "2024-01-01T10:00:10.000Z",
    pointCount: 2,
    startTime: "2024-01-01T10:00:05.000Z",
  });
});
