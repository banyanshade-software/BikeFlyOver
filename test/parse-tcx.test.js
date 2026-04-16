const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTcxTrack, summarizeTrackpoints } = require("../src/io/tcx/parseTcx");

test("parseTcxTrack sorts, filters invalid points, and removes duplicates", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <TrainingCenterDatabase>
    <Activities>
      <Activity Sport="Biking">
        <Lap StartTime="2024-01-01T10:00:00Z">
          <Track>
            <Trackpoint>
              <Time>2024-01-01T10:00:10Z</Time>
              <Position>
                <LatitudeDegrees>46.1002</LatitudeDegrees>
                <LongitudeDegrees>6.2002</LongitudeDegrees>
              </Position>
              <AltitudeMeters>420</AltitudeMeters>
              <DistanceMeters>80</DistanceMeters>
            </Trackpoint>
            <Trackpoint>
              <Time>2024-01-01T10:00:05Z</Time>
              <Position>
                <LatitudeDegrees>46.1001</LatitudeDegrees>
                <LongitudeDegrees>6.2001</LongitudeDegrees>
              </Position>
              <AltitudeMeters>410</AltitudeMeters>
              <DistanceMeters>40</DistanceMeters>
              <HeartRateBpm><Value>140</Value></HeartRateBpm>
              <Extensions>
                <TPX>
                  <Speed>8.5</Speed>
                  <Temp>17</Temp>
                </TPX>
              </Extensions>
            </Trackpoint>
            <Trackpoint>
              <Time>2024-01-01T10:00:05Z</Time>
              <Position>
                <LatitudeDegrees>46.1001</LatitudeDegrees>
                <LongitudeDegrees>6.2001</LongitudeDegrees>
              </Position>
              <AltitudeMeters>410</AltitudeMeters>
              <DistanceMeters>40</DistanceMeters>
            </Trackpoint>
            <Trackpoint>
              <Time>2024-01-01T10:00:12Z</Time>
              <Position>
                <LatitudeDegrees>46.1003</LatitudeDegrees>
                <LongitudeDegrees>6.2003</LongitudeDegrees>
              </Position>
            </Trackpoint>
          </Track>
        </Lap>
      </Activity>
    </Activities>
  </TrainingCenterDatabase>`;

  const trackpoints = parseTcxTrack(xml);

  assert.equal(trackpoints.length, 2);
  assert.deepEqual(
    trackpoints.map((trackpoint) => trackpoint.timestamp),
    [
      Date.parse("2024-01-01T10:00:05Z"),
      Date.parse("2024-01-01T10:00:10Z"),
    ],
  );
  assert.equal(trackpoints[0].heartRate, 140);
  assert.equal(trackpoints[0].speed, 8.5);
  assert.equal(trackpoints[0].temperature, 17);
});

test("summarizeTrackpoints returns duration and bounds for normalized points", () => {
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
