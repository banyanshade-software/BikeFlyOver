// Timeline editor: pure layout math shared by the renderer timeline widget and the unit tests.
// Loaded with require() in Node and with a plain <script> tag in the renderer (exposed as
// window.BikeFlyOverTimelineLayout), so it must stay dependency-free.
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.BikeFlyOverTimelineLayout = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SECOND_MS = 1000;
  const MINUTE_MS = 60 * SECOND_MS;
  const HOUR_MS = 60 * MINUTE_MS;
  const TICK_STEPS_MS = Object.freeze([
    1 * SECOND_MS,
    2 * SECOND_MS,
    5 * SECOND_MS,
    10 * SECOND_MS,
    15 * SECOND_MS,
    30 * SECOND_MS,
    1 * MINUTE_MS,
    2 * MINUTE_MS,
    5 * MINUTE_MS,
    10 * MINUTE_MS,
    15 * MINUTE_MS,
    30 * MINUTE_MS,
    1 * HOUR_MS,
    2 * HOUR_MS,
    3 * HOUR_MS,
    6 * HOUR_MS,
  ]);
  const MIN_VIEW_SPAN_MS = 10 * SECOND_MS;

  function timestampToX(timestamp, view, widthPx) {
    const span = view.end - view.start;
    return span > 0 ? ((timestamp - view.start) / span) * widthPx : 0;
  }

  function xToTimestamp(x, view, widthPx) {
    return widthPx > 0 ? view.start + (x / widthPx) * (view.end - view.start) : view.start;
  }

  function formatTimelineOffset(offsetMs) {
    const totalSeconds = Math.max(0, Math.round(offsetMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // Smallest "nice" step whose labels stay at least minSpacingPx apart.
  function chooseTickStepMs(view, widthPx, minSpacingPx = 80) {
    const span = view.end - view.start;

    if (!(span > 0) || !(widthPx > 0)) {
      return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
    }

    const msPerPx = span / widthPx;

    for (const step of TICK_STEPS_MS) {
      if (step / msPerPx >= minSpacingPx) {
        return step;
      }
    }

    return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  }

  // Ticks are aligned on multiples of the step measured from originTimestamp (activity start),
  // so labels read as elapsed activity time.
  function buildTicks(view, widthPx, originTimestamp, minSpacingPx = 80) {
    const step = chooseTickStepMs(view, widthPx, minSpacingPx);
    const minorStep = step / 5;
    const firstIndex = Math.ceil((view.start - originTimestamp) / minorStep);
    const ticks = [];

    for (let index = firstIndex; ; index += 1) {
      const timestamp = originTimestamp + index * minorStep;

      if (timestamp > view.end) {
        break;
      }

      const major = index % 5 === 0;
      ticks.push({
        timestamp,
        x: timestampToX(timestamp, view, widthPx),
        major,
        label: major ? formatTimelineOffset(timestamp - originTimestamp) : null,
      });
    }

    return ticks;
  }

  // Keep the view inside [bounds.start, bounds.end] and at least minSpanMs wide (or the whole
  // bounds when they are shorter than that).
  function clampView(view, bounds, minSpanMs = MIN_VIEW_SPAN_MS) {
    const boundsSpan = Math.max(0, bounds.end - bounds.start);
    const span = Math.min(boundsSpan, Math.max(minSpanMs, view.end - view.start));
    let start = Math.min(Math.max(view.start, bounds.start), bounds.end - span);
    start = Math.max(bounds.start, start);
    return { start, end: start + span };
  }

  // factor < 1 zooms in, > 1 zooms out; anchorTimestamp stays under the cursor.
  function zoomView(view, anchorTimestamp, factor, bounds, minSpanMs = MIN_VIEW_SPAN_MS) {
    const span = view.end - view.start;
    const nextSpan = Math.max(minSpanMs, span * factor);
    const anchorRatio = span > 0 ? (anchorTimestamp - view.start) / span : 0.5;
    const start = anchorTimestamp - anchorRatio * nextSpan;
    return clampView({ start, end: start + nextSpan }, bounds, minSpanMs);
  }

  function panView(view, deltaMs, bounds, minSpanMs = MIN_VIEW_SPAN_MS) {
    return clampView(
      { start: view.start + deltaMs, end: view.end + deltaMs },
      bounds,
      minSpanMs,
    );
  }

  // Greedy interval packing: each item goes to the first row whose last item ends before it
  // starts (plus gapMs). Items past maxRows land on the least-loaded-at-that-time row.
  function packIntoRows(items, options = {}) {
    const gapMs = options.gapMs ?? 0;
    const maxRows = options.maxRows ?? Number.POSITIVE_INFINITY;
    const rowEnds = [];
    const sorted = [...items].sort((left, right) => left.start - right.start);
    const rowById = new Map();

    for (const item of sorted) {
      let row = rowEnds.findIndex((rowEnd) => rowEnd + gapMs <= item.start);

      if (row === -1) {
        if (rowEnds.length < maxRows) {
          row = rowEnds.length;
          rowEnds.push(Number.NEGATIVE_INFINITY);
        } else {
          row = rowEnds.indexOf(Math.min(...rowEnds));
        }
      }

      rowEnds[row] = Math.max(rowEnds[row], item.end);
      rowById.set(item.id, row);
    }

    return { rowById, rowCount: Math.max(1, rowEnds.length) };
  }

  // Return the candidate closest to timestamp if within thresholdMs, else timestamp unchanged.
  function snapTimestamp(timestamp, candidates, thresholdMs) {
    let best = timestamp;
    let bestDistance = thresholdMs;

    for (const candidate of candidates) {
      if (!Number.isFinite(candidate)) {
        continue;
      }

      const distance = Math.abs(candidate - timestamp);

      if (distance <= bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }

  // Viewport to show when the playhead leaves the visible window during playback: page forward
  // (or back) keeping the same span, with the playhead a little inside the left edge.
  function followPlayhead(view, timestamp, bounds, leadRatio = 0.1) {
    if (timestamp >= view.start && timestamp <= view.end) {
      return view;
    }

    const span = view.end - view.start;
    const start = timestamp - span * leadRatio;
    return clampView({ start, end: start + span }, bounds, 0);
  }

  return {
    MIN_VIEW_SPAN_MS,
    TICK_STEPS_MS,
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
  };
});
