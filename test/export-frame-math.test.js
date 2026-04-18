const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildExportTimeline,
  computeExportFrameCount,
  getExportFrameState,
} = require("../src/shared/export");

const trackpoints = [
  {
    distance: 0,
    latitude: 46.1,
    longitude: 6.1,
    speed: 4,
    timestamp: 0,
  },
  {
    distance: 10,
    latitude: 46.1001,
    longitude: 6.1001,
    speed: 4,
    timestamp: 5_000,
  },
  {
    distance: 20,
    latitude: 46.1002,
    longitude: 6.1002,
    speed: 4,
    timestamp: 10_000,
  },
];

test("export timeline inserts photo media without advancing activity time", () => {
  const exportTimeline = buildExportTimeline({
    mediaItems: [
      {
        alignedActivityTimestamp: 3_000,
        fileName: "photo.jpg",
        id: "photo-1",
        mediaType: "image",
      },
    ],
    settings: {
      enterDurationMs: 500,
      exitDurationMs: 500,
      fps: 10,
      photoDisplayDurationMs: 1_000,
      speedMultiplier: 2,
      timingMode: "proportional",
    },
    trackpoints,
  });

  assert.deepEqual(
    exportTimeline.segments.map((segment) => segment.kind),
    ["track", "photo", "track", "track"],
  );
  assert.equal(exportTimeline.totalVideoDurationMs, 7_000);
  assert.deepEqual(
    exportTimeline.segments.map((segment) => segment.videoDurationMs),
    [1_500, 2_000, 1_000, 2_500],
  );
  assert.equal(
    computeExportFrameCount({
      exportTimeline,
      fps: 10,
    }),
    71,
  );

  assert.deepEqual(
    getExportFrameState({
      exportTimeline,
      frameIndex: 20,
      fps: 10,
    }),
    {
      activeMedia: {
        elapsedMs: 500,
        imageScale: 1.025,
        itemId: "photo-1",
        mediaType: "image",
        opacity: 1,
        progressRatio: 0.25,
        scale: 1,
        totalDurationMs: 2_000,
        translateX: 0,
        translateY: 0,
        imageFit: "contain",
        videoCurrentTimeMs: 0,
      },
      activityTimestamp: 3_000,
      videoTimeMs: 2_000,
    },
  );
});

test("fixed-speed export frame state reaches the final activity timestamp on the last frame", () => {
  const exportTimeline = buildExportTimeline({
    settings: {
      fps: 5,
      speedMultiplier: 2,
      timingMode: "fixed-speed",
    },
    trackpoints,
  });

  assert.equal(exportTimeline.totalVideoDurationMs, 5_000);
  assert.equal(
    computeExportFrameCount({
      exportTimeline,
      fps: 5,
    }),
    26,
  );

  assert.deepEqual(
    getExportFrameState({
      exportTimeline,
      frameIndex: 25,
      fps: 5,
    }),
    {
      activeMedia: null,
      activityTimestamp: 10_000,
      videoTimeMs: 5_000,
    },
  );
});
