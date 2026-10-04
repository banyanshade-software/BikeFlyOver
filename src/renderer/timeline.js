// Timeline editor: horizontal timeline docked at the bottom of the window. It shows the ruler
// (with the selected playback range), the altitude profile, imported media and the camera moves
// on one shared activity-time axis. Media and camera moves can be dragged; camera moves can also
// be resized, added and deleted. The widget owns no project state: it reads a model through
// getModel() and reports edits through callbacks, so renderer.js stays the single source of truth.
(function () {
  const DRAG_THRESHOLD_PX = 3;
  const SNAP_THRESHOLD_PX = 8;
  const MEDIA_ROW_HEIGHT_PX = 30;
  const MEDIA_MAX_ROWS = 3;
  const MOVE_ROW_HEIGHT_PX = 26;
  const MOVE_MAX_ROWS = 2;
  const MIN_BLOCK_WIDTH_PX = 26;
  const MIN_MOVE_DURATION_MS = 1000;
  const MOVE_TYPE_LABELS = Object.freeze({
    orbit: "Orbit",
    lookAt: "Look-at",
    cinematic: "Sweep",
  });

  const TEMPLATE = `
    <div class="tl-toolbar">
      <button type="button" class="tl-button tl-play" data-role="play" title="Play / pause (Space)">▶</button>
      <span class="tl-clock">
        <strong id="timelineElapsed">00:00</strong>
        <span class="tl-clock-sep">/</span>
        <span id="timelineDuration">00:00</span>
        <span class="tl-clock-wall" data-role="wallClock"></span>
      </span>
      <span class="tl-range-label" data-role="rangeLabel"></span>
      <span class="tl-spacer"></span>
      <label class="tl-add-move">
        <span>Camera move</span>
        <select data-role="moveType">
          <option value="orbit">Orbit</option>
          <option value="lookAt">Look-at</option>
          <option value="cinematic">Cinematic sweep</option>
        </select>
      </label>
      <button type="button" class="tl-button" data-role="addMove" title="Add a camera move at the playhead (or double-click the Camera lane)">+ Add at playhead</button>
      <span class="tl-toolbar-sep"></span>
      <button type="button" class="tl-button" data-role="resetRange" title="Use the whole activity">Full range</button>
      <button type="button" class="tl-button tl-icon" data-role="zoomOut" title="Zoom out">−</button>
      <button type="button" class="tl-button" data-role="zoomFit" title="Fit whole activity">Fit</button>
      <button type="button" class="tl-button tl-icon" data-role="zoomIn" title="Zoom in (or Ctrl/⌘ + wheel)">+</button>
    </div>
    <div class="tl-body">
      <div class="tl-labels">
        <div class="tl-label tl-label--ruler"></div>
        <div class="tl-label tl-label--profile">Altitude</div>
        <div class="tl-label tl-label--media" data-role="mediaLabel">Media</div>
        <div class="tl-label tl-label--moves">Camera</div>
      </div>
      <div class="tl-viewport" data-role="viewport">
        <div class="tl-ruler" data-role="ruler">
          <div class="tl-ticks" data-role="ticks"></div>
          <div class="tl-range" data-role="range">
            <div class="tl-range-handle" data-edge="start" title="Drag to set the range start"></div>
            <div class="tl-range-handle" data-edge="end" title="Drag to set the range end"></div>
          </div>
        </div>
        <div class="tl-lane tl-lane--profile"><canvas data-role="profile"></canvas></div>
        <div class="tl-lane tl-lane--media" data-role="mediaLane"></div>
        <div class="tl-lane tl-lane--moves" data-role="movesLane"></div>
        <div class="tl-mask tl-mask--before" data-role="maskBefore"></div>
        <div class="tl-mask tl-mask--after" data-role="maskAfter"></div>
        <div class="tl-playhead" data-role="playhead"></div>
        <div class="tl-drag-tip" data-role="dragTip" hidden></div>
        <div class="tl-empty" data-role="empty">Import an activity to use the timeline.</div>
      </div>
    </div>
  `;

  function createTimelineEditor(options) {
    const { root, layout, getModel, callbacks } = options;
    root.innerHTML = TEMPLATE;
    root.tabIndex = 0;

    const el = Object.fromEntries(
      Array.from(root.querySelectorAll("[data-role]")).map((node) => [
        node.dataset.role,
        node,
      ]),
    );
    const mediaElements = new Map();
    const moveElements = new Map();
    const state = {
      view: null,
      boundsKey: null,
      drag: null,
      profileCache: null,
      model: null,
    };

    function getBounds(model) {
      return { start: model.fullStart, end: model.fullEnd };
    }

    function getWidth() {
      return el.viewport.clientWidth;
    }

    function toX(timestamp) {
      return layout.timestampToX(timestamp, state.view, getWidth());
    }

    function toTimestamp(clientX) {
      const rect = el.viewport.getBoundingClientRect();
      return layout.xToTimestamp(clientX - rect.left, state.view, getWidth());
    }

    function msPerPx() {
      const width = getWidth();
      return width > 0 ? (state.view.end - state.view.start) / width : 0;
    }

    function clampToBounds(timestamp) {
      const model = state.model;
      return Math.min(model.fullEnd, Math.max(model.fullStart, timestamp));
    }

    function ensureView(model) {
      const key = `${model.fullStart}:${model.fullEnd}`;

      if (state.boundsKey !== key || !state.view) {
        state.boundsKey = key;
        state.view = getBounds(model);
        state.profileCache = null;
      }
    }

    function setView(nextView) {
      state.view = nextView;
      render();
    }

    // ---------- rendering ----------

    function renderTicks(model) {
      const ticks = layout.buildTicks(state.view, getWidth(), model.fullStart);
      el.ticks.innerHTML = ticks
        .map((tick) => {
          const left = tick.x.toFixed(1);
          return tick.major
            ? `<div class="tl-tick tl-tick--major" style="left:${left}px"><span>${tick.label}</span></div>`
            : `<div class="tl-tick" style="left:${left}px"></div>`;
        })
        .join("");
    }

    function renderRange(model) {
      const width = getWidth();
      const startX = toX(model.rangeStart);
      const endX = toX(model.rangeEnd);
      el.range.style.left = `${startX}px`;
      el.range.style.width = `${Math.max(0, endX - startX)}px`;
      el.maskBefore.style.width = `${Math.max(0, Math.min(width, startX))}px`;
      el.maskAfter.style.left = `${Math.max(0, endX)}px`;
      el.maskAfter.style.width = `${Math.max(0, width - endX)}px`;
      const isFull = model.rangeStart === model.fullStart && model.rangeEnd === model.fullEnd;
      el.rangeLabel.textContent = isFull
        ? ""
        : `Range ${layout.formatTimelineOffset(model.rangeStart - model.fullStart)} → ${layout.formatTimelineOffset(model.rangeEnd - model.fullStart)}`;
      el.resetRange.disabled = isFull || model.disabled;
    }

    function getProfileStats(model) {
      if (state.profileCache?.trackpoints === model.trackpoints) {
        return state.profileCache;
      }

      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;

      for (const point of model.trackpoints) {
        if (Number.isFinite(point.altitude)) {
          min = Math.min(min, point.altitude);
          max = Math.max(max, point.altitude);
        }
      }

      state.profileCache = { trackpoints: model.trackpoints, min, max };
      return state.profileCache;
    }

    function findIndexAtOrBefore(trackpoints, timestamp) {
      let low = 0;
      let high = trackpoints.length - 1;

      while (low < high) {
        const middle = Math.floor((low + high + 1) / 2);

        if (trackpoints[middle].timestamp <= timestamp) {
          low = middle;
        } else {
          high = middle - 1;
        }
      }

      return low;
    }

    function renderProfile(model) {
      const canvas = el.profile;
      const width = getWidth();
      const height = canvas.parentElement.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const { trackpoints } = model;
      const stats = getProfileStats(model);

      if (trackpoints.length < 2 || !Number.isFinite(stats.min)) {
        return;
      }

      const span = Math.max(1, stats.max - stats.min);
      const padding = 3;
      const yFor = (altitude) =>
        height - padding - ((altitude - stats.min) / span) * (height - padding * 2);
      const firstX = Math.max(0, Math.floor(toX(model.fullStart)));
      const lastX = Math.min(width, Math.ceil(toX(model.fullEnd)));

      context.beginPath();
      context.moveTo(firstX, height);

      for (let x = firstX; x <= lastX; x += 1) {
        const timestamp = layout.xToTimestamp(x, state.view, width);
        const point = trackpoints[findIndexAtOrBefore(trackpoints, timestamp)];
        context.lineTo(x, yFor(Number.isFinite(point.altitude) ? point.altitude : stats.min));
      }

      context.lineTo(lastX, height);
      context.closePath();
      context.fillStyle = "rgba(121, 189, 255, 0.22)";
      context.fill();
      context.strokeStyle = "rgba(121, 189, 255, 0.75)";
      context.lineWidth = 1;
      context.stroke();
    }

    function syncKeyedElements(map, items, container, create) {
      const liveIds = new Set(items.map((item) => item.id));

      for (const [id, node] of map) {
        if (!liveIds.has(id)) {
          node.remove();
          map.delete(id);
        }
      }

      for (const item of items) {
        if (!map.has(item.id)) {
          const node = create(item);
          map.set(item.id, node);
          container.append(node);
        }
      }
    }

    function placeBlock(node, start, end, row, rowHeight) {
      const left = toX(start);
      const width = Math.max(MIN_BLOCK_WIDTH_PX, toX(end) - left);
      node.style.left = `${left}px`;
      node.style.width = `${width}px`;
      node.style.top = `${2 + row * rowHeight}px`;
      node.style.height = `${rowHeight - 4}px`;
    }

    function createMediaElement(item) {
      const node = document.createElement("div");
      node.className = "tl-media";
      node.dataset.mediaId = item.id;
      const thumb = document.createElement("div");
      thumb.className = "tl-media-thumb";
      const label = document.createElement("span");
      label.className = "tl-media-label";
      node.append(thumb, label);
      return node;
    }

    function renderMedia(model) {
      const { rowById, rowCount } = layout.packIntoRows(
        model.media.map((item) => {
          // Pack by on-screen extent so tiny photo blocks (min width) do not overlap.
          const minEnd = item.start + MIN_BLOCK_WIDTH_PX * msPerPx();
          return { id: item.id, start: item.start, end: Math.max(item.end, minEnd) };
        }),
        { maxRows: MEDIA_MAX_ROWS },
      );
      el.mediaLane.style.height = `${rowCount * MEDIA_ROW_HEIGHT_PX + 4}px`;
      el.mediaLabel.style.height = el.mediaLane.style.height;
      el.mediaLabel.textContent =
        model.missingMediaCount > 0
          ? `Media (${model.missingMediaCount} undated)`
          : "Media";
      el.mediaLabel.title =
        model.missingMediaCount > 0
          ? "Media without a capture date cannot be placed on the timeline."
          : "";

      syncKeyedElements(mediaElements, model.media, el.mediaLane, createMediaElement);

      for (const item of model.media) {
        const node = mediaElements.get(item.id);
        const isDragged = state.drag?.kind === "media" && state.drag.id === item.id && state.drag.moved;
        const start = isDragged ? state.drag.currentStart : item.start;
        placeBlock(node, start, start + (item.end - item.start), rowById.get(item.id) ?? 0, MEDIA_ROW_HEIGHT_PX);
        node.classList.toggle("tl-media--video", item.kind === "video");
        node.classList.toggle("tl-media--selected", item.id === model.selectedMediaId);
        node.classList.toggle("tl-media--out", Boolean(item.outOfRange));
        node.classList.toggle("tl-media--active", item.id === model.activeMediaId);
        node.classList.toggle("tl-media--shifted", item.offsetSeconds !== 0);
        const thumb = node.firstChild;
        const thumbUrl = item.thumbUrl ? `url("${item.thumbUrl}")` : "";
        if (thumb.dataset.url !== thumbUrl) {
          thumb.style.backgroundImage = thumbUrl;
          thumb.dataset.url = thumbUrl;
        }
        node.lastChild.textContent = item.kind === "video" ? `▶ ${item.label}` : item.label;
        node.title = item.tooltip;
      }
    }

    function createMoveElement(move) {
      const node = document.createElement("div");
      node.className = "tl-move";
      node.dataset.moveId = move.id;
      const label = document.createElement("span");
      label.className = "tl-move-label";
      const handle = document.createElement("div");
      handle.className = "tl-move-resize";
      handle.title = "Drag to change the duration";
      node.append(label, handle);
      return node;
    }

    function getMoveDisplayWindow(move) {
      const drag = state.drag;

      if (drag?.kind === "move" && drag.id === move.id && drag.moved) {
        return { start: drag.currentStart, end: drag.currentStart + (move.end - move.start) };
      }

      if (drag?.kind === "resize" && drag.id === move.id && drag.moved) {
        return { start: move.start, end: drag.currentEnd };
      }

      return { start: move.start, end: move.end };
    }

    function renderMoves(model) {
      const windows = new Map(model.moves.map((move) => [move.id, getMoveDisplayWindow(move)]));
      const { rowById, rowCount } = layout.packIntoRows(
        model.moves.map((move) => ({ id: move.id, ...windows.get(move.id) })),
        { maxRows: MOVE_MAX_ROWS },
      );
      el.movesLane.style.height = `${rowCount * MOVE_ROW_HEIGHT_PX + 4}px`;
      root.querySelector(".tl-label--moves").style.height = el.movesLane.style.height;

      syncKeyedElements(moveElements, model.moves, el.movesLane, createMoveElement);

      for (const move of model.moves) {
        const node = moveElements.get(move.id);
        const extent = windows.get(move.id);
        placeBlock(node, extent.start, extent.end, rowById.get(move.id) ?? 0, MOVE_ROW_HEIGHT_PX);
        node.dataset.type = move.type;
        node.classList.toggle("tl-move--selected", move.id === model.selectedMoveId);
        node.firstChild.textContent = `${MOVE_TYPE_LABELS[move.type] || move.type} · ${Math.round((extent.end - extent.start) / 100) / 10}s`;
        node.title = `${MOVE_TYPE_LABELS[move.type] || move.type} at ${layout.formatTimelineOffset(extent.start - model.fullStart)} for ${Math.round((extent.end - extent.start) / 100) / 10}s\nDrag to move, drag the right edge to resize, Delete to remove.`;
      }
    }

    function renderPlayhead(model) {
      const x = toX(model.current);
      el.playhead.style.transform = `translateX(${x}px)`;
      el.playhead.hidden = x < -1 || x > getWidth() + 1;
      el.play.textContent = model.isPlaying ? "❚❚" : "▶";
      el.wallClock.textContent = model.wallClockLabel || "";
    }

    function render() {
      const model = getModel();
      state.model = model;
      root.classList.toggle("tl--disabled", Boolean(model.disabled));
      root.classList.toggle("tl--empty", !model.hasTrack);
      el.empty.hidden = model.hasTrack;

      for (const role of ["play", "addMove", "zoomIn", "zoomOut", "zoomFit", "moveType"]) {
        el[role].disabled = !model.hasTrack || Boolean(model.disabled);
      }

      if (!model.hasTrack) {
        el.ticks.innerHTML = "";
        el.rangeLabel.textContent = "";
        el.resetRange.disabled = true;
        syncKeyedElements(mediaElements, [], el.mediaLane, createMediaElement);
        syncKeyedElements(moveElements, [], el.movesLane, createMoveElement);
        el.profile.getContext("2d").clearRect(0, 0, el.profile.width, el.profile.height);
        el.playhead.hidden = true;
        el.range.hidden = true;
        el.maskBefore.style.width = "0";
        el.maskAfter.style.width = "0";
        return;
      }

      el.range.hidden = false;
      ensureView(model);
      renderTicks(model);
      renderRange(model);
      renderProfile(model);
      renderMedia(model);
      renderMoves(model);
      renderPlayhead(model);
    }

    // Called on every playback frame: only moves the playhead, and pages the view while playing.
    function updatePlayhead() {
      if (!state.model) {
        render();
        return;
      }

      // Cheap per-frame state only; the full model is rebuilt by render().
      const model = Object.assign(state.model, options.getPlayheadState());

      if (!model.hasTrack || !state.view) {
        return;
      }

      if (model.isPlaying && !state.drag) {
        const nextView = layout.followPlayhead(state.view, model.current, getBounds(model));

        if (nextView !== state.view) {
          setView(nextView);
          return;
        }
      }

      renderPlayhead(model);
      el.mediaLane.querySelectorAll(".tl-media").forEach((node) => {
        node.classList.toggle("tl-media--active", node.dataset.mediaId === model.activeMediaId);
      });
    }

    // ---------- interactions ----------

    function getSnapCandidates(excludeId) {
      const model = state.model;
      const candidates = [model.current, model.rangeStart, model.rangeEnd];

      for (const move of model.moves) {
        if (move.id !== excludeId) {
          candidates.push(move.start, move.end);
        }
      }

      return candidates;
    }

    function snap(timestamp, event, excludeId) {
      if (event.altKey) {
        return timestamp;
      }

      return layout.snapTimestamp(
        timestamp,
        getSnapCandidates(excludeId),
        SNAP_THRESHOLD_PX * msPerPx(),
      );
    }

    function showDragTip(clientX, text) {
      const rect = el.viewport.getBoundingClientRect();
      el.dragTip.hidden = false;
      el.dragTip.textContent = text;
      el.dragTip.style.left = `${Math.min(rect.width - 120, Math.max(0, clientX - rect.left + 10))}px`;
    }

    function formatTip(timestamp) {
      const model = state.model;
      const offset = layout.formatTimelineOffset(timestamp - model.fullStart);
      const clock = callbacks.formatClock?.(timestamp);
      return clock ? `${offset} · ${clock}` : offset;
    }

    function startDrag(event, drag) {
      state.drag = { ...drag, pointerId: event.pointerId, startClientX: event.clientX, moved: false };
      el.viewport.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onPointerDown(event) {
      const model = state.model;

      if (!model?.hasTrack || model.disabled || event.button !== 0) {
        return;
      }

      root.focus({ preventScroll: true });
      const target = event.target;
      // Pointer capture retargets the following click/dblclick to the viewport; remember the
      // real target for onDoubleClick.
      state.lastPointerDownTarget = target;
      const rangeHandle = target.closest(".tl-range-handle");
      const resizeHandle = target.closest(".tl-move-resize");
      const moveNode = target.closest(".tl-move");
      const mediaNode = target.closest(".tl-media");

      if (rangeHandle) {
        startDrag(event, { kind: "range", edge: rangeHandle.dataset.edge });
        callbacks.onScrubStart?.();
        return;
      }

      if (resizeHandle && moveNode) {
        const move = model.moves.find((candidate) => candidate.id === moveNode.dataset.moveId);
        callbacks.onMoveSelect?.(move.id);
        startDrag(event, { kind: "resize", id: move.id, origin: move, currentEnd: move.end });
        return;
      }

      if (moveNode) {
        const move = model.moves.find((candidate) => candidate.id === moveNode.dataset.moveId);
        callbacks.onMoveSelect?.(move.id);
        startDrag(event, { kind: "move", id: move.id, origin: move, currentStart: move.start });
        return;
      }

      if (mediaNode) {
        const item = model.media.find((candidate) => candidate.id === mediaNode.dataset.mediaId);
        callbacks.onMediaSelect?.(item.id);
        startDrag(event, { kind: "media", id: item.id, origin: item, currentStart: item.start });
        return;
      }

      // Ruler or empty lane: scrub the playhead.
      if (target.closest(".tl-lane--moves")) {
        callbacks.onMoveSelect?.(null);
      }
      startDrag(event, { kind: "scrub" });
      callbacks.onScrubStart?.();
      callbacks.onScrub?.(toTimestamp(event.clientX));
    }

    function onPointerMove(event) {
      const drag = state.drag;

      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      const dx = event.clientX - drag.startClientX;

      if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD_PX && drag.kind !== "scrub") {
        return;
      }

      drag.moved = true;
      const model = state.model;
      const pointerTimestamp = clampToBounds(toTimestamp(event.clientX));

      if (drag.kind === "scrub") {
        callbacks.onScrub?.(pointerTimestamp);
        return;
      }

      if (drag.kind === "range") {
        const snapped = snap(pointerTimestamp, event);
        const start = drag.edge === "start" ? Math.min(snapped, model.rangeEnd) : model.rangeStart;
        const end = drag.edge === "end" ? Math.max(snapped, model.rangeStart) : model.rangeEnd;
        callbacks.onRangeChange?.(start, end);
        showDragTip(event.clientX, formatTip(drag.edge === "start" ? start : end));
        return;
      }

      if (drag.kind === "media" || drag.kind === "move") {
        const duration = drag.origin.end - drag.origin.start;
        let start = drag.origin.start + dx * msPerPx();
        // Snap either edge of the block, whichever is closer to a candidate.
        const startDelta = snap(start, event, drag.id) - start;
        const endDelta = snap(start + duration, event, drag.id) - (start + duration);
        if (startDelta !== 0 && (endDelta === 0 || Math.abs(startDelta) <= Math.abs(endDelta))) {
          start += startDelta;
        } else {
          start += endDelta;
        }
        const maxStart = drag.kind === "move" ? model.fullEnd - MIN_MOVE_DURATION_MS : model.fullEnd;
        drag.currentStart = Math.min(maxStart, Math.max(model.fullStart, start));
        showDragTip(event.clientX, formatTip(drag.currentStart));
        render();
        return;
      }

      if (drag.kind === "resize") {
        const end = snap(drag.origin.end + dx * msPerPx(), event, drag.id);
        drag.currentEnd = Math.min(
          model.fullEnd,
          Math.max(drag.origin.start + MIN_MOVE_DURATION_MS, end),
        );
        showDragTip(
          event.clientX,
          `${Math.round((drag.currentEnd - drag.origin.start) / 100) / 10}s`,
        );
        render();
      }
    }

    function onPointerUp(event) {
      const drag = state.drag;

      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }

      state.drag = null;
      el.dragTip.hidden = true;

      if (el.viewport.hasPointerCapture(event.pointerId)) {
        el.viewport.releasePointerCapture(event.pointerId);
      }

      if (drag.kind === "scrub" || drag.kind === "range") {
        callbacks.onScrubEnd?.();
        return;
      }

      if (!drag.moved) {
        // Plain click on a block: jump the playhead to its start.
        callbacks.onSeek?.(drag.origin.start);
        render();
        return;
      }

      if (drag.kind === "media") {
        callbacks.onMediaCommit?.(drag.id, drag.currentStart);
      } else if (drag.kind === "move") {
        callbacks.onMoveCommit?.(drag.id, {
          start: drag.currentStart,
          durationMs: drag.origin.end - drag.origin.start,
        });
      } else if (drag.kind === "resize") {
        callbacks.onMoveCommit?.(drag.id, {
          start: drag.origin.start,
          durationMs: drag.currentEnd - drag.origin.start,
        });
      }

      render();
    }

    function onPointerCancel(event) {
      if (!state.drag || event.pointerId !== state.drag.pointerId) {
        return;
      }

      const wasScrub = state.drag.kind === "scrub" || state.drag.kind === "range";
      state.drag = null;
      el.dragTip.hidden = true;

      if (wasScrub) {
        callbacks.onScrubEnd?.();
      }

      render();
    }

    function onDoubleClick(event) {
      const model = state.model;

      if (!model?.hasTrack || model.disabled) {
        return;
      }

      const target = state.lastPointerDownTarget ?? event.target;
      const mediaNode = target.closest(".tl-media");

      if (mediaNode) {
        callbacks.onMediaReset?.(mediaNode.dataset.mediaId);
        return;
      }

      if (target.closest(".tl-lane--moves") && !target.closest(".tl-move")) {
        callbacks.onMoveAdd?.(el.moveType.value, clampToBounds(toTimestamp(event.clientX)));
      }
    }

    function onWheel(event) {
      const model = state.model;

      if (!model?.hasTrack || !state.view) {
        return;
      }

      event.preventDefault();

      // Changing the view mid-drag would shift the block under the pointer.
      if (state.drag) {
        return;
      }

      const bounds = getBounds(model);
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX;

      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) {
        const factor = Math.exp(event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
        setView(layout.zoomView(state.view, toTimestamp(event.clientX), factor, bounds));
        return;
      }

      setView(layout.panView(state.view, horizontal * msPerPx(), bounds));
    }

    function zoomAroundPlayhead(factor) {
      const model = state.model;

      if (!model?.hasTrack || !state.view) {
        return;
      }

      const anchor =
        model.current >= state.view.start && model.current <= state.view.end
          ? model.current
          : (state.view.start + state.view.end) / 2;
      setView(layout.zoomView(state.view, anchor, factor, getBounds(model)));
    }

    function onKeyDown(event) {
      const model = state.model;

      if (!model?.hasTrack || model.disabled || event.target.closest("select, input")) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && model.selectedMoveId) {
        event.preventDefault();
        callbacks.onMoveDelete?.(model.selectedMoveId);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const stepMs = event.shiftKey ? 30000 : 5000;
        callbacks.onSeek?.(
          clampToBounds(model.current + (event.key === "ArrowLeft" ? -stepMs : stepMs)),
        );
      } else if (event.key === "+" || event.key === "=") {
        zoomAroundPlayhead(0.5);
      } else if (event.key === "-") {
        zoomAroundPlayhead(2);
      }
    }

    el.viewport.addEventListener("pointerdown", onPointerDown);
    el.viewport.addEventListener("pointermove", onPointerMove);
    el.viewport.addEventListener("pointerup", onPointerUp);
    el.viewport.addEventListener("pointercancel", onPointerCancel);
    el.viewport.addEventListener("dblclick", onDoubleClick);
    el.viewport.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("keydown", onKeyDown);
    el.play.addEventListener("click", () => callbacks.onTogglePlay?.());
    el.addMove.addEventListener("click", () => {
      callbacks.onMoveAdd?.(el.moveType.value, state.model?.current);
    });
    el.resetRange.addEventListener("click", () => callbacks.onRangeReset?.());
    el.zoomIn.addEventListener("click", () => zoomAroundPlayhead(0.5));
    el.zoomOut.addEventListener("click", () => zoomAroundPlayhead(2));
    el.zoomFit.addEventListener("click", () => {
      if (state.model?.hasTrack) {
        setView(getBounds(state.model));
      }
    });

    new ResizeObserver(() => render()).observe(el.viewport);

    return {
      render,
      updatePlayhead,
      isDragging: () => Boolean(state.drag),
    };
  }

  window.createTimelineEditor = createTimelineEditor;
})();
