// F-15: shared normaliser for predefined camera moves placed on the track timeline.
// This module is used by both the renderer (live playback) and project-state.js
// (save/load persistence).

const CAMERA_MOVE_TYPES = Object.freeze(["orbit", "lookAt", "cinematic"]);

const CAMERA_MOVE_DEFAULTS = Object.freeze({
  orbit: {
    durationSeconds: 6,
    orbitRadiusMeters: 150,
    orbitAltitudeOffsetMeters: 80,
    orbitAngularSpeedDegPerSec: 45,
  },
  lookAt: {
    durationSeconds: 4,
    lookAtAltitudeOffsetMeters: 300,
    lookAtCameraRadiusMeters: 400,
  },
  cinematic: {
    durationSeconds: 5,
    cinematicEndOffsetSeconds: 30,
    cinematicAltitudeMultiplier: 3,
  },
});

function normalizeFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePositiveFinite(value, fallback) {
  const n = normalizeFinite(value, fallback);
  return n > 0 ? n : fallback;
}

/**
 * Normalise a single raw camera-move object.
 * Returns null if the move type is unknown or triggerTimestamp is invalid.
 */
function normalizeCameraMove(rawMove = {}) {
  const type = CAMERA_MOVE_TYPES.includes(rawMove?.type) ? rawMove.type : null;
  if (!type) return null;

  const triggerTimestamp = normalizeFinite(rawMove.triggerTimestamp, null);
  if (triggerTimestamp === null) return null;

  const defaults = CAMERA_MOVE_DEFAULTS[type];
  const id =
    typeof rawMove.id === "string" && rawMove.id.length > 0
      ? rawMove.id
      : `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const base = {
    id,
    type,
    triggerTimestamp,
    durationSeconds: normalizePositiveFinite(rawMove.durationSeconds, defaults.durationSeconds),
  };

  if (type === "orbit") {
    return {
      ...base,
      orbitRadiusMeters: normalizePositiveFinite(
        rawMove.orbitRadiusMeters,
        defaults.orbitRadiusMeters,
      ),
      orbitAltitudeOffsetMeters: normalizeFinite(
        rawMove.orbitAltitudeOffsetMeters,
        defaults.orbitAltitudeOffsetMeters,
      ),
      orbitAngularSpeedDegPerSec: normalizePositiveFinite(
        rawMove.orbitAngularSpeedDegPerSec,
        defaults.orbitAngularSpeedDegPerSec,
      ),
    };
  }

  if (type === "lookAt") {
    return {
      ...base,
      lookAtAltitudeOffsetMeters: normalizePositiveFinite(
        rawMove.lookAtAltitudeOffsetMeters,
        defaults.lookAtAltitudeOffsetMeters,
      ),
      lookAtCameraRadiusMeters: normalizePositiveFinite(
        rawMove.lookAtCameraRadiusMeters,
        defaults.lookAtCameraRadiusMeters,
      ),
    };
  }

  // cinematic
  return {
    ...base,
    cinematicEndOffsetSeconds: normalizePositiveFinite(
      rawMove.cinematicEndOffsetSeconds,
      defaults.cinematicEndOffsetSeconds,
    ),
    cinematicAltitudeMultiplier: normalizePositiveFinite(
      rawMove.cinematicAltitudeMultiplier,
      defaults.cinematicAltitudeMultiplier,
    ),
  };
}

/**
 * Normalise an array of raw camera moves, discarding any that are invalid.
 * Guarantees sorted order by triggerTimestamp ascending.
 */
function normalizeCameraMoves(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  return rawArray
    .map((item) => normalizeCameraMove(item))
    .filter(Boolean)
    .sort((a, b) => a.triggerTimestamp - b.triggerTimestamp);
}

module.exports = { CAMERA_MOVE_DEFAULTS, CAMERA_MOVE_TYPES, normalizeCameraMove, normalizeCameraMoves };
// end F-15
