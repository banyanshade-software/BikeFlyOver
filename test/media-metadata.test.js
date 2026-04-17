const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCameraIdentity,
  extractImageCameraIdentity,
  extractVideoCameraIdentity,
  selectImageTimestampCandidate,
  selectVideoTimestampCandidate,
} = require("../src/shared/media-metadata");

test("image timestamp selection prefers original shoot time over later fallbacks", () => {
  assert.deepEqual(
    selectImageTimestampCandidate({
      CreateDate: new Date("2024-01-01T10:02:00Z"),
      DateTimeOriginal: new Date("2024-01-01T10:00:00Z"),
      ModifyDate: new Date("2024-01-01T10:03:00Z"),
    }),
    {
      source: "exif:DateTimeOriginal",
      value: new Date("2024-01-01T10:00:00Z"),
    },
  );
});

test("video timestamp selection prefers QuickTime shoot-time tags over generic creation time", () => {
  assert.deepEqual(
    selectVideoTimestampCandidate({
      format: {
        tags: {
          "com.apple.quicktime.creationdate": "2024-01-01T10:00:00+02:00",
          creation_time: "2024-01-02T11:00:00Z",
        },
      },
    }),
    {
      source: "ffprobe:format.com.apple.quicktime.creationdate",
      value: "2024-01-01T10:00:00+02:00",
    },
  );
});

test("camera identity extraction prefers stable make/model metadata for images and videos", () => {
  assert.deepEqual(
    extractImageCameraIdentity({
      BodySerialNumber: "ABC123",
      Make: "Canon",
      Model: "R6",
    }),
    {
      cameraIdentityId: "canon|r6|abc123",
      cameraIdentityLabel: "Canon R6 #ABC123",
      cameraIdentitySource: "exif:Make/Model",
    },
  );

  assert.deepEqual(
    extractVideoCameraIdentity({
      format: {
        tags: {
          "com.apple.quicktime.make": "GoPro",
          "com.apple.quicktime.model": "Hero 11",
        },
      },
    }),
    {
      cameraIdentityId: "gopro|hero 11",
      cameraIdentityLabel: "GoPro Hero 11",
      cameraIdentitySource: "ffprobe:format.quicktime.make-model",
    },
  );
});

test("camera identity builder returns empty fields when metadata is unavailable", () => {
  assert.deepEqual(buildCameraIdentity({}), {
    cameraIdentityId: null,
    cameraIdentityLabel: null,
    cameraIdentitySource: null,
  });
});
