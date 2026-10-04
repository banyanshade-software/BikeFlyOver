const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTicks,
  chooseTickStepMs,
  clampView,
  followPlayhead,
  formatTimelineOffset,
  packIntoRows,
  panView,
  snapTimestamp,
  timestampToX,
  xToTimestamp,
  zoomView,
} = require("../src/shared/timeline-layout");
const {
  alignMediaItemToTrack,
  computeMediaOffsetSecondsForTimestamp,
} = require("../src/shared/media-alignment");

const HOUR = 3600 * 1000;
const bounds = { start: 0, end: 2 * HOUR };

test("timestampToX and xToTimestamp are inverse", () => {
  const view = { start: 1000, end: 61000 };
  assert.strictEqual(timestampToX(31000, view, 600), 300);
  assert.strictEqual(xToTimestamp(300, view, 600), 31000);
});

test("formatTimelineOffset uses mm:ss then h:mm:ss", () => {
  assert.strictEqual(formatTimelineOffset(65 * 1000), "01:05");
  assert.strictEqual(formatTimelineOffset(HOUR + 2 * 60 * 1000 + 3000), "1:02:03");
});

test("chooseTickStepMs keeps labels apart", () => {
  // 2 h on 1200 px = 6 s/px; 80 px min → >= 480 s → 10 min step.
  assert.strictEqual(chooseTickStepMs(bounds, 1200, 80), 10 * 60 * 1000);
  // 60 s on 1200 px → 5 s step (5 s = 100 px).
  assert.strictEqual(chooseTickStepMs({ start: 0, end: 60000 }, 1200, 80), 5000);
});

test("buildTicks labels major ticks from the activity origin", () => {
  const ticks = buildTicks({ start: 500, end: 60500 }, 1200, 500, 80);
  const majors = ticks.filter((tick) => tick.major);
  assert.strictEqual(majors[0].label, "00:00");
  assert.strictEqual(majors[1].label, "00:05");
  assert.ok(ticks.every((tick) => tick.timestamp >= 500 && tick.timestamp <= 60500));
});

test("clampView keeps the view inside bounds with a minimum span", () => {
  assert.deepStrictEqual(clampView({ start: -1000, end: 5000 }, bounds, 10000), {
    start: 0,
    end: 10000,
  });
  assert.deepStrictEqual(clampView({ start: 0, end: 3 * HOUR }, bounds), bounds);
});

test("zoomView keeps the anchor under the cursor", () => {
  const view = zoomView(bounds, HOUR, 0.5, bounds);
  assert.strictEqual(view.end - view.start, HOUR);
  assert.strictEqual((HOUR - view.start) / (view.end - view.start), 0.5);
});

test("panView stops at bounds", () => {
  const view = panView({ start: 0, end: HOUR }, 5 * HOUR, bounds);
  assert.deepStrictEqual(view, { start: HOUR, end: 2 * HOUR });
});

test("followPlayhead pages only when the playhead leaves the view", () => {
  const view = { start: 0, end: 1000 * 100 };
  assert.strictEqual(followPlayhead(view, 50000, bounds), view);
  const paged = followPlayhead(view, 150000, bounds);
  assert.strictEqual(paged.start, 140000);
  assert.strictEqual(paged.end - paged.start, 100000);
});

test("packIntoRows stacks overlapping items", () => {
  const { rowById, rowCount } = packIntoRows([
    { id: "a", start: 0, end: 10 },
    { id: "b", start: 5, end: 15 },
    { id: "c", start: 12, end: 20 },
  ]);
  assert.strictEqual(rowCount, 2);
  assert.strictEqual(rowById.get("a"), 0);
  assert.strictEqual(rowById.get("b"), 1);
  assert.strictEqual(rowById.get("c"), 0);
});

test("packIntoRows honours maxRows", () => {
  const { rowCount, rowById } = packIntoRows(
    [
      { id: "a", start: 0, end: 10 },
      { id: "b", start: 1, end: 10 },
      { id: "c", start: 2, end: 10 },
    ],
    { maxRows: 2 },
  );
  assert.strictEqual(rowCount, 2);
  assert.ok([0, 1].includes(rowById.get("c")));
});

test("snapTimestamp snaps only within the threshold", () => {
  assert.strictEqual(snapTimestamp(1050, [1000, 5000], 100), 1000);
  assert.strictEqual(snapTimestamp(1500, [1000, 5000], 100), 1500);
});

test("computeMediaOffsetSecondsForTimestamp moves media to the target time", () => {
  const item = { id: "m1", capturedAtTimestamp: 10000, fileName: "a.jpg" };
  const offset = computeMediaOffsetSecondsForTimestamp(item, 70400, {});
  assert.strictEqual(offset, 60);

  const offsets = { mediaOffsetsByMediaId: { m1: offset } };
  const trackpoints = [{ timestamp: 0 }, { timestamp: 100000 }];
  const aligned = alignMediaItemToTrack(item, trackpoints, offsets);
  assert.strictEqual(aligned.alignedActivityTimestamp, 70000);
});

test("computeMediaOffsetSecondsForTimestamp overrides camera offset when back on EXIF time", () => {
  const item = { id: "m1", cameraIdentityId: "cam", capturedAtTimestamp: 10000 };
  const offsets = { cameraOffsetsByCameraId: { cam: 30 } };
  const offset = computeMediaOffsetSecondsForTimestamp(item, 10000, offsets);
  assert.ok(offset !== 0);

  const aligned = alignMediaItemToTrack(
    item,
    [{ timestamp: 0 }, { timestamp: 100000 }],
    { ...offsets, mediaOffsetsByMediaId: { m1: offset } },
  );
  assert.strictEqual(aligned.alignedActivityTimestamp, 10001);
  assert.strictEqual(aligned.appliedAlignmentOffsetSource, "media");
});

test("computeMediaOffsetSecondsForTimestamp returns null without EXIF time", () => {
  assert.strictEqual(computeMediaOffsetSecondsForTimestamp({ id: "x" }, 1000, {}), null);
});
