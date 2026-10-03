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

// F-29: target-duration mode produces exactly the requested video length.
test("target-duration export timeline produces the requested video length", () => {
  const exportTimeline = buildExportTimeline({
    settings: {
      fps: 10,
      targetDurationSeconds: 5,
      timingMode: "target-duration",
    },
    trackpoints,
  });

  assert.equal(exportTimeline.totalVideoDurationMs, 5_000);
  assert.equal(
    computeExportFrameCount({
      exportTimeline,
      fps: 10,
    }),
    51,
  );

  assert.deepEqual(
    getExportFrameState({
      exportTimeline,
      frameIndex: 50,
      fps: 10,
    }),
    {
      activeMedia: null,
      activityTimestamp: 10_000,
      videoTimeMs: 5_000,
    },
  );
});
// end F-29

test("adaptive-speed export caps each stop or pause at 0.1 s of video", () => {
  const moving = (timestamp, offset) => ({
    latitude: 46.1 + offset,
    longitude: 6.1,
    speed: 8,
    timestamp,
  });
  const stopped = (timestamp, offset) => ({
    latitude: 46.1 + offset,
    longitude: 6.1,
    speed: 0,
    timestamp,
  });
  const stopTrackpoints = [moving(0, 0), moving(10_000, 0.0007)];

  // 10-minute stop recorded every second.
  for (let second = 1; second <= 600; second += 1) {
    stopTrackpoints.push(stopped(10_000 + second * 1_000, 0.0007));
  }

  stopTrackpoints.push(moving(620_000, 0.0014));
  // 20-minute auto-pause: no points recorded, same position on resume.
  stopTrackpoints.push(stopped(1_820_000, 0.0014));
  stopTrackpoints.push(moving(1_830_000, 0.0021));

  const settings = { adaptiveStrength: 1, speedMultiplier: 10, timingMode: "adaptive-speed" };
  const exportTimeline = buildExportTimeline({ settings, trackpoints: stopTrackpoints });
  const stopVideoMs = exportTimeline.segments
    .filter((segment) => {
      return (
        (segment.activityStartTimestamp >= 10_000 && segment.activityEndTimestamp <= 610_000) ||
        (segment.activityStartTimestamp >= 620_000 && segment.activityEndTimestamp <= 1_820_000)
      );
    })
    .reduce((sum, segment) => sum + segment.videoDurationMs, 0);

  assert.ok(Math.abs(stopVideoMs - 200) < 1e-6, `stops took ${stopVideoMs} ms`);
  assert.equal(
    exportTimeline.segments.at(-1).activityEndTimestamp,
    1_830_000,
  );
});
