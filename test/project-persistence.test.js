const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROJECT_STATE_SCHEMA_VERSION,
  deserializeProjectState,
  normalizeProjectState,
  serializeProjectState,
} = require("../src/shared/project-state");

test("normalizeProjectState clamps settings and keeps only serializable media fields", () => {
  const normalized = normalizeProjectState({
    exportSettings: {
      fps: 999,
      speedMultiplier: 0.1,
      terrainSettings: {
        enabled: false,
        exaggeration: 99,
      },
    },
    mediaItems: [
      {
        alignedActivityTimestamp: 1_500,
        alignmentStatus: "aligned",
        fileName: "photo.jpg",
        filePath: "/tmp/photo.jpg",
        id: "photo-1",
        mediaType: "image",
        previewUrl: "data:image/png;base64,ignored",
      },
    ],
    playback: {
      cameraMode: "follow",
      currentTimestamp: 1_234,
      speedGaugePeakTimestamp: "not-a-number",
      speedMultiplier: 0.25,
      terrainSettings: {
        enabled: true,
        exaggeration: 9,
      },
    },
    track: {
      filePath: "/tmp/track.tcx",
      importFormat: "tcx",
    },
  });

  assert.equal(normalized.schemaVersion, PROJECT_STATE_SCHEMA_VERSION);
  assert.equal(normalized.track.fileName, "track.tcx");
  assert.equal(normalized.exportSettings.fps, 999);
  assert.equal(normalized.exportSettings.speedMultiplier, 0.1);
  assert.deepEqual(normalized.exportSettings.terrainSettings, {
    enabled: false,
    exaggeration: 4,
    routeOffsetMeters: 1.5,
  });
  assert.equal(normalized.playback.currentTimestamp, 1_234);
  assert.equal(normalized.playback.speedGaugePeakTimestamp, 1_234);
  assert.equal(normalized.playback.speedMultiplier, 0.25);
  assert.equal(normalized.mediaItems[0].previewUrl, undefined);
});

test("project state survives JSON round-trips and invalid JSON fails loudly", () => {
  const serialized = serializeProjectState({
    mediaItems: [
      {
        fileName: "clip.mp4",
        filePath: "/tmp/clip.mp4",
        id: "clip-1",
        mediaDurationMs: 2_500,
        mediaType: "video",
      },
    ],
    playback: {
      currentTimestamp: 2_000,
      isPlaying: true,
    },
  });

  const roundTripped = deserializeProjectState(serialized);

  assert.equal(roundTripped.playback.currentTimestamp, 2_000);
  assert.equal(roundTripped.playback.isPlaying, true);
  assert.equal(roundTripped.mediaItems[0].mediaType, "video");
  assert.throws(
    () => deserializeProjectState("{not-json"),
    /Project file is not valid JSON\./,
  );
});
