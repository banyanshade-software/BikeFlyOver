const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFitTrack } = require("../src/io/fit/parseFit");

// ---------------------------------------------------------------------------
// Minimal FIT binary fixture builder
//
// The FIT binary format is documented at https://developer.garmin.com/fit/.
// Key encoding choices used here:
//   - Global message 20 = record (trackpoint data)
//   - FIT epoch: 631,065,600 s after Unix epoch (Dec 31, 1989 00:00:00 UTC)
//   - Lat/lon stored as SINT32 semicircles: degrees * (2^31 / 180)
//   - Altitude stored as UINT16: (metres + 500) * 5
//   - speed stored as UINT16: m/s * 1000
//   - distance stored as UINT32: metres * 100
//   - temperature stored as SINT8: °C (no scaling)
//   - force:true on the parser so the file-level CRC is not validated
// ---------------------------------------------------------------------------

const FIT_EPOCH_OFFSET = 631065600; // seconds
const SC_PER_DEGREE = Math.pow(2, 31) / 180;
const SC_CONST = 180 / Math.pow(2, 31); // degrees per semicircle

/**
 * Build a FIT definition message for global message 20 (record).
 * Fields included: timestamp, position_lat, position_long, altitude,
 * heart_rate, cadence, speed, distance, temperature.
 */
function buildRecordDefinition() {
  return Buffer.from([
    0x40, 0x00,        // definition msg header, reserved
    0x00,              // little-endian architecture
    0x14, 0x00,        // global message 20 (record)
    0x09,              // 9 fields
    // [field_def_num, size_bytes, base_type]
    0xFD, 0x04, 0x86,  // 253 = timestamp (UINT32)
    0x00, 0x04, 0x85,  //   0 = position_lat (SINT32)
    0x01, 0x04, 0x85,  //   1 = position_long (SINT32)
    0x02, 0x02, 0x84,  //   2 = altitude (UINT16)
    0x03, 0x01, 0x02,  //   3 = heart_rate (UINT8)
    0x04, 0x01, 0x02,  //   4 = cadence (UINT8)
    0x06, 0x02, 0x84,  //   6 = speed (UINT16)
    0x05, 0x04, 0x86,  //   5 = distance (UINT32)
    0x0D, 0x01, 0x01,  //  13 = temperature (SINT8)
  ]);
}

/**
 * Encode a single data record (local message 0, matches definition above).
 * @param {object} opts
 */
function buildRecordData({
  unixTimestampS,
  latDeg,
  lonDeg,
  altitudeM,
  heartRate = 0xff,       // 0xff = invalid/missing for UINT8
  cadence = 0xff,
  speedMs = null,
  distanceM = null,
  temperatureC = null,
}) {
  const buf = Buffer.alloc(1 + 4 + 4 + 4 + 2 + 1 + 1 + 2 + 4 + 1);
  let offset = 0;

  buf.writeUInt8(0x00, offset); offset += 1; // data message, local msg 0

  const fitTs = Math.round(unixTimestampS) - FIT_EPOCH_OFFSET;
  buf.writeUInt32LE(fitTs, offset); offset += 4;

  buf.writeInt32LE(Math.round(latDeg * SC_PER_DEGREE), offset); offset += 4;
  buf.writeInt32LE(Math.round(lonDeg * SC_PER_DEGREE), offset); offset += 4;

  buf.writeUInt16LE(Math.round((altitudeM + 500) * 5), offset); offset += 2;

  buf.writeUInt8(heartRate, offset); offset += 1;
  buf.writeUInt8(cadence, offset); offset += 1;

  // speed UINT16: m/s * 1000, 0xFFFF = invalid
  const speedRaw =
    speedMs !== null && Number.isFinite(speedMs)
      ? Math.round(speedMs * 1000)
      : 0xffff;
  buf.writeUInt16LE(speedRaw, offset); offset += 2;

  // distance UINT32: m * 100, 0xFFFFFFFF = invalid
  const distRaw =
    distanceM !== null && Number.isFinite(distanceM)
      ? Math.round(distanceM * 100)
      : 0xffffffff;
  buf.writeUInt32LE(distRaw, offset); offset += 4;

  // temperature SINT8, 0x7F = invalid
  const tempRaw =
    temperatureC !== null && Number.isFinite(temperatureC)
      ? Math.round(temperatureC)
      : 0x7f;
  buf.writeInt8(tempRaw, offset);

  return buf;
}

function buildFitFile(...recordDataBuffers) {
  const dataSection = Buffer.concat([buildRecordDefinition(), ...recordDataBuffers]);
  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(0x10, 1);
  header.writeUInt16LE(0, 2);
  header.writeUInt32LE(dataSection.length, 4);
  header.write(".FIT", 8, "ascii");
  header.writeUInt16LE(0, 12); // CRC = 0, accepted because parser uses force:true
  return Buffer.concat([header, dataSection]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function approxEqual(actual, expected, tolerance = 0.0001) {
  return Math.abs(actual - expected) <= tolerance;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("parseFitTrack parses all fields correctly", () => {
  const buf = buildFitFile(
    buildRecordData({
      unixTimestampS: 1704067205,   // 2024-01-01T00:00:05Z
      latDeg: 46.1001,
      lonDeg: 6.2001,
      altitudeM: 410,
      heartRate: 140,
      cadence: 80,
      speedMs: 8.5,
      distanceM: 1000,
      temperatureC: 17,
    }),
  );

  const trackpoints = parseFitTrack(buf);
  assert.equal(trackpoints.length, 1);

  const tp = trackpoints[0];
  assert.equal(tp.timestamp, 1704067205000);
  assert.equal(tp.time, "2024-01-01T00:00:05.000Z");
  assert.ok(approxEqual(tp.latitude, 46.1001), `lat ${tp.latitude}`);
  assert.ok(approxEqual(tp.longitude, 6.2001), `lon ${tp.longitude}`);
  assert.equal(tp.altitude, 410);
  assert.equal(tp.heartRate, 140);
  assert.equal(tp.cadence, 80);
  assert.ok(approxEqual(tp.speed, 8.5, 0.001), `speed ${tp.speed}`);
  assert.ok(approxEqual(tp.distance, 1000, 1), `distance ${tp.distance}`);
  assert.equal(tp.temperature, 17);
});

test("parseFitTrack returns null for missing optional fields", () => {
  const buf = buildFitFile(
    buildRecordData({
      unixTimestampS: 1704067205,
      latDeg: 46.1001,
      lonDeg: 6.2001,
      altitudeM: 410,
      // heartRate, cadence, speedMs, distanceM, temperatureC all missing (use invalid sentinel)
    }),
  );

  const trackpoints = parseFitTrack(buf);
  assert.equal(trackpoints.length, 1);

  const tp = trackpoints[0];
  assert.equal(tp.heartRate, null);
  assert.equal(tp.cadence, null);
  assert.equal(tp.speed, null);
  assert.equal(tp.distance, null);
  assert.equal(tp.temperature, null);
});

test("parseFitTrack sorts out-of-order records by timestamp", () => {
  // Point A has a later timestamp but appears first in the file
  const ptA = buildRecordData({
    unixTimestampS: 1704067210,   // 00:00:10Z
    latDeg: 46.1002,
    lonDeg: 6.2002,
    altitudeM: 415,
  });
  const ptB = buildRecordData({
    unixTimestampS: 1704067200,   // 00:00:00Z  (earlier)
    latDeg: 46.1000,
    lonDeg: 6.2000,
    altitudeM: 410,
  });

  const trackpoints = parseFitTrack(buildFitFile(ptA, ptB));
  assert.equal(trackpoints.length, 2);
  assert.ok(trackpoints[0].timestamp < trackpoints[1].timestamp, "sorted by timestamp");
  assert.equal(trackpoints[0].timestamp, 1704067200000);
  assert.equal(trackpoints[1].timestamp, 1704067210000);
});

test("parseFitTrack removes exact duplicate records", () => {
  const ptOrig = buildRecordData({
    unixTimestampS: 1704067200,
    latDeg: 46.1,
    lonDeg: 6.2,
    altitudeM: 410,
  });
  // Identical duplicate
  const ptDup = buildRecordData({
    unixTimestampS: 1704067200,
    latDeg: 46.1,
    lonDeg: 6.2,
    altitudeM: 410,
  });

  const trackpoints = parseFitTrack(buildFitFile(ptOrig, ptDup));
  assert.equal(trackpoints.length, 1);
});

test("parseFitTrack throws for a buffer that produces no valid records", () => {
  // Supply an otherwise valid FIT file but with only an empty definition and no data records
  const dataSection = buildRecordDefinition();
  const header = Buffer.alloc(14);
  header.writeUInt8(14, 0);
  header.writeUInt8(0x10, 1);
  header.writeUInt16LE(0, 2);
  header.writeUInt32LE(dataSection.length, 4);
  header.write(".FIT", 8, "ascii");
  header.writeUInt16LE(0, 12);
  const empty = Buffer.concat([header, dataSection]);

  assert.throws(
    () => parseFitTrack(empty),
    (err) => err.message.includes("No valid trackpoints"),
  );
});

test("parseFitTrack throws for a corrupt / non-FIT buffer", () => {
  // Completely invalid binary
  const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  assert.throws(() => parseFitTrack(garbage));
});
