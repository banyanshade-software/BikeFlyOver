const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CAMERA_MOVE_DEFAULTS,
  CAMERA_MOVE_TYPES,
  normalizeCameraMove,
  normalizeCameraMoves,
} = require("../src/shared/camera-moves");
const { normalizeProjectState } = require("../src/shared/project-state");

// F-15: tests for camera-move normaliser and active-move project round-trip.

test("normalizeCameraMove returns null for unknown type", () => {
  assert.strictEqual(normalizeCameraMove({ type: "zoom", triggerTimestamp: 1000 }), null);
});

test("normalizeCameraMove returns null for missing triggerTimestamp", () => {
  assert.strictEqual(normalizeCameraMove({ type: "orbit" }), null);
  assert.strictEqual(normalizeCameraMove({ type: "orbit", triggerTimestamp: "not-a-number" }), null);
});

test("normalizeCameraMove fills orbit defaults", () => {
  const move = normalizeCameraMove({ type: "orbit", triggerTimestamp: 5000 });
  assert.ok(move);
  assert.strictEqual(move.type, "orbit");
  assert.strictEqual(move.triggerTimestamp, 5000);
  assert.strictEqual(move.durationSeconds, CAMERA_MOVE_DEFAULTS.orbit.durationSeconds);
  assert.strictEqual(move.orbitRadiusMeters, CAMERA_MOVE_DEFAULTS.orbit.orbitRadiusMeters);
  assert.strictEqual(move.orbitAltitudeOffsetMeters, CAMERA_MOVE_DEFAULTS.orbit.orbitAltitudeOffsetMeters);
  assert.strictEqual(move.orbitAngularSpeedDegPerSec, CAMERA_MOVE_DEFAULTS.orbit.orbitAngularSpeedDegPerSec);
  assert.ok(typeof move.id === "string" && move.id.length > 0);
});

test("normalizeCameraMove fills lookAt defaults", () => {
  const move = normalizeCameraMove({ type: "lookAt", triggerTimestamp: 10000 });
  assert.ok(move);
  assert.strictEqual(move.type, "lookAt");
  assert.strictEqual(move.durationSeconds, CAMERA_MOVE_DEFAULTS.lookAt.durationSeconds);
  assert.strictEqual(move.lookAtAltitudeOffsetMeters, CAMERA_MOVE_DEFAULTS.lookAt.lookAtAltitudeOffsetMeters);
  assert.strictEqual(move.lookAtCameraRadiusMeters, CAMERA_MOVE_DEFAULTS.lookAt.lookAtCameraRadiusMeters);
});

test("normalizeCameraMove fills cinematic defaults", () => {
  const move = normalizeCameraMove({ type: "cinematic", triggerTimestamp: 20000 });
  assert.ok(move);
  assert.strictEqual(move.type, "cinematic");
  assert.strictEqual(move.durationSeconds, CAMERA_MOVE_DEFAULTS.cinematic.durationSeconds);
  assert.strictEqual(move.cinematicEndOffsetSeconds, CAMERA_MOVE_DEFAULTS.cinematic.cinematicEndOffsetSeconds);
  assert.strictEqual(move.cinematicAltitudeMultiplier, CAMERA_MOVE_DEFAULTS.cinematic.cinematicAltitudeMultiplier);
});

test("normalizeCameraMove preserves custom values", () => {
  const move = normalizeCameraMove({
    type: "orbit",
    triggerTimestamp: 3000,
    durationSeconds: 12,
    orbitRadiusMeters: 300,
    orbitAngularSpeedDegPerSec: 60,
  });
  assert.strictEqual(move.durationSeconds, 12);
  assert.strictEqual(move.orbitRadiusMeters, 300);
  assert.strictEqual(move.orbitAngularSpeedDegPerSec, 60);
});

test("normalizeCameraMove clamps non-positive duration to default", () => {
  const move = normalizeCameraMove({ type: "orbit", triggerTimestamp: 1000, durationSeconds: -5 });
  assert.strictEqual(move.durationSeconds, CAMERA_MOVE_DEFAULTS.orbit.durationSeconds);
});

test("normalizeCameraMove preserves provided id", () => {
  const move = normalizeCameraMove({ type: "lookAt", triggerTimestamp: 0, id: "my-custom-id" });
  assert.strictEqual(move.id, "my-custom-id");
});

test("normalizeCameraMoves returns empty array for non-array input", () => {
  assert.deepEqual(normalizeCameraMoves(null), []);
  assert.deepEqual(normalizeCameraMoves(undefined), []);
  assert.deepEqual(normalizeCameraMoves("bad"), []);
});

test("normalizeCameraMoves filters out invalid items", () => {
  const result = normalizeCameraMoves([
    { type: "orbit", triggerTimestamp: 5000 },
    { type: "unknown", triggerTimestamp: 1000 },
    null,
    { type: "cinematic" },
    { type: "lookAt", triggerTimestamp: 2000 },
  ]);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].type, "lookAt");  // sorted by triggerTimestamp
  assert.strictEqual(result[1].type, "orbit");
});

test("normalizeCameraMoves sorts by triggerTimestamp ascending", () => {
  const result = normalizeCameraMoves([
    { type: "orbit", triggerTimestamp: 9000 },
    { type: "cinematic", triggerTimestamp: 1000 },
    { type: "lookAt", triggerTimestamp: 4000 },
  ]);
  assert.strictEqual(result[0].triggerTimestamp, 1000);
  assert.strictEqual(result[1].triggerTimestamp, 4000);
  assert.strictEqual(result[2].triggerTimestamp, 9000);
});

test("normalizeProjectState round-trips cameraMoves", () => {
  const raw = {
    cameraMoves: [
      { type: "orbit", triggerTimestamp: 5000, durationSeconds: 8, orbitRadiusMeters: 200 },
      { type: "cinematic", triggerTimestamp: 1000, durationSeconds: 5 },
    ],
  };
  const normalized = normalizeProjectState(raw);
  assert.ok(Array.isArray(normalized.cameraMoves));
  assert.strictEqual(normalized.cameraMoves.length, 2);
  // Should be sorted: cinematic (1000) first, orbit (5000) second.
  assert.strictEqual(normalized.cameraMoves[0].type, "cinematic");
  assert.strictEqual(normalized.cameraMoves[1].type, "orbit");
  assert.strictEqual(normalized.cameraMoves[1].orbitRadiusMeters, 200);
});

test("normalizeProjectState produces empty cameraMoves array when field is absent", () => {
  const normalized = normalizeProjectState({});
  assert.deepEqual(normalized.cameraMoves, []);
});

test("CAMERA_MOVE_TYPES exports the three supported types", () => {
  assert.ok(CAMERA_MOVE_TYPES.includes("orbit"));
  assert.ok(CAMERA_MOVE_TYPES.includes("lookAt"));
  assert.ok(CAMERA_MOVE_TYPES.includes("cinematic"));
});
// end F-15
