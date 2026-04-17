const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MEDIA_ALIGNMENT_OFFSET_DEFAULTS,
  alignMediaItemsToTrack,
  findNearestTrackIndex,
  getMediaAlignmentOffsetForItem,
  normalizeMediaAlignmentOffsets,
} = require("../src/shared/media-alignment");
const {
  getActiveMediaPresentation,
  normalizeMediaPresentationSettings,
} = require("../src/shared/media-presentation");

const trackpoints = [
  { timestamp: 1_000 },
  { timestamp: 2_000 },
  { timestamp: 3_000 },
];

test("findNearestTrackIndex chooses the closest sample across the track bounds", () => {
  assert.equal(findNearestTrackIndex(trackpoints, 900), 0);
  assert.equal(findNearestTrackIndex(trackpoints, 2_450), 1);
  assert.equal(findNearestTrackIndex(trackpoints, 2_750), 2);
  assert.equal(findNearestTrackIndex(trackpoints, 3_500), 2);
});

test("alignMediaItemsToTrack clamps before-start and after-end captures and sorts the result", () => {
  const alignedItems = alignMediaItemsToTrack(
    [
      {
        capturedAtTimestamp: 3_500,
        fileName: "later.jpg",
      },
      {
        capturedAtTimestamp: 1_500,
        fileName: "middle.jpg",
      },
      {
        capturedAtTimestamp: 500,
        fileName: "early.jpg",
      },
    ],
    trackpoints,
  );

  assert.deepEqual(
    alignedItems.map((item) => ({
      alignedActivityTimestamp: item.alignedActivityTimestamp,
      alignmentStatus: item.alignmentStatus,
      fileName: item.fileName,
      nearestTrackIndex: item.nearestTrackIndex,
    })),
    [
      {
        alignedActivityTimestamp: 1_000,
        alignmentStatus: "before-start",
        fileName: "early.jpg",
        nearestTrackIndex: 0,
      },
      {
        alignedActivityTimestamp: 1_500,
        alignmentStatus: "aligned",
        fileName: "middle.jpg",
        nearestTrackIndex: 0,
      },
      {
        alignedActivityTimestamp: 3_000,
        alignmentStatus: "after-end",
        fileName: "later.jpg",
        nearestTrackIndex: 2,
      },
    ],
  );
});

test("alignment offsets shift the effective capture time before track alignment", () => {
  const alignedItems = alignMediaItemsToTrack(
    [
      {
        cameraIdentityId: "gopro|hero",
        capturedAtTimestamp: 1_500,
        fileName: "offset.jpg",
        id: "media-1",
      },
    ],
    trackpoints,
    {
      cameraOffsetsByCameraId: {
        "gopro|hero": 1,
      },
      mediaOffsetsByMediaId: {
        "media-1": -0.25,
      },
    },
  );

  assert.deepEqual(normalizeMediaAlignmentOffsets(), MEDIA_ALIGNMENT_OFFSET_DEFAULTS);
  assert.deepEqual(
    getMediaAlignmentOffsetForItem(
      {
        cameraIdentityId: "gopro|hero",
        id: "media-1",
      },
      {
        cameraOffsetsByCameraId: {
          "gopro|hero": 1,
        },
        mediaOffsetsByMediaId: {
          "media-1": -0.25,
        },
      },
    ),
    {
      offsetSeconds: -0.25,
      source: "media",
    },
  );
  assert.equal(alignedItems[0].adjustedCapturedAtTimestamp, 1_250);
  assert.equal(alignedItems[0].appliedAlignmentOffsetMs, -250);
  assert.equal(alignedItems[0].appliedAlignmentOffsetSource, "media");
  assert.equal(alignedItems[0].alignedActivityTimestamp, 1_250);
  assert.equal(alignedItems[0].nearestTrackIndex, 0);
});

test("getActiveMediaPresentation picks the most recent overlapping media window", () => {
  const settings = normalizeMediaPresentationSettings({
    enterDurationMs: 250,
    exitDurationMs: 250,
    photoDisplayDurationMs: 500,
  });
  const activeMedia = getActiveMediaPresentation({
    mediaItems: [
      {
        alignedActivityTimestamp: 1_000,
        fileName: "earlier.jpg",
        id: "a",
        mediaType: "image",
      },
      {
        alignedActivityTimestamp: 1_300,
        fileName: "later.jpg",
        id: "b",
        mediaType: "image",
      },
    ],
    playbackTimestamp: 1_450,
    settings,
  });

  assert.equal(activeMedia.item.id, "b");
  assert.equal(activeMedia.presentationStartTimestamp, 1_300);
  assert.equal(activeMedia.elapsedMs, 150);
  assert.ok(activeMedia.opacity > 0 && activeMedia.opacity < 1);
});
