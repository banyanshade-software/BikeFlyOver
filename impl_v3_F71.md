# impl_v3_F71 — Drag-and-drop trace import, confirmation dialog, media date check, remove POC default track

## Goal

When the user drags and drops a trace file (`.tcx`, `.gpx`, `.fit`) onto the app window:
1. A confirmation dialog appears with three choices: **Refuse**, **Accept in this window**, **Accept in new window**.
2. "Accept in new window" is the default choice when a track is already loaded.
3. "Accept in this window" clears all current media and loads the new trace.
4. If existing media timestamps don't overlap the new trace's date range, the dialog shows a warning.
5. The bundled POC sample track is removed; the app starts with an empty state.

---

## Background

### Current state

| What | Where |
|---|---|
| Activity import (file-picker) | `src/main/main.js` `importActivityFile()`, `ipcMain.handle("activity-import")` |
| Track reload (renderer) | `reloadTrack(viewer, playbackState, newTrackData)` in renderer.js |
| Sample track startup | `initializeApp()` calls `window.bikeFlyOverApp.loadSampleTrack()` |
| Media library state | `mediaLibraryState.items` — each item has `capturedAtTimestamp` (epoch ms) |
| Track time range | `trackData.summary.startTime` / `.endTime` (Date objects); trackpoints have `.timestamp` (epoch ms) |
| Window creation | `createMainWindow()` in main.js — creates a single `BrowserWindow` |
| `createPlaybackState(trackpoints, opts)` | Crashes if `trackpoints` is empty (accesses `trackpoints[0]`) |

### Relevant files

| File | Role |
|---|---|
| `src/main/main.js` | IPC handlers, window creation |
| `src/main/preload.js` | Context bridge |
| `src/renderer/renderer.js` | All renderer logic |
| `src/renderer/index.html` | UI markup |
| `src/renderer/styles.css` | UI styles |
| `src/shared/sample-track.js` | `loadActivityFile`, `loadSampleTrack` |

---

## Part 1 — Remove the POC default sample track

### 1a. Guard `createPlaybackState` for empty trackpoints

`createPlaybackState` directly reads `trackpoints[0]` and `trackpoints[trackpoints.length - 1]`,
which crashes on an empty array. Add a guard:

```js
function createPlaybackState(trackpoints, options = {}) {
  const hasTrackpoints = trackpoints.length > 0;
  const fullStartTimestamp = hasTrackpoints ? trackpoints[0].timestamp : 0;
  const fullEndTimestamp   = hasTrackpoints ? trackpoints[trackpoints.length - 1].timestamp : 0;
  // ... rest of function unchanged, currentSample becomes trackpoints[0] ?? null
  return {
    // ...
    currentSample: trackpoints[0] ?? null,
    // ...
  };
}
```

### 1b. Update `initializeApp` to start with no track

Replace the `loadSampleTrack` / `createPlaybackState(sampleTrack.trackpoints)` flow with an empty
playback state. Skip `addRouteEntities`, `addPlaybackEntities`, `renderSummary`, `startPlayback`
when trackpoints are empty.

```js
// Before (remove):
const sampleTrack = await window.bikeFlyOverApp.loadSampleTrack();
const playbackState = createPlaybackState(sampleTrack.trackpoints, { ... });
// ...
addRouteEntities(viewer, playbackState, sampleTrack);
addPlaybackEntities(viewer, playbackState);
renderSummary(sampleTrack);
startPlayback(viewer, playbackState);
updateImportActivityUi({ status: "complete", trackData: sampleTrack });

// After (add):
const playbackState = createPlaybackState([], {
  adaptiveStrength: EXPORT_OPTIONS.defaults.adaptiveStrength,
  speedMultiplier: EXPORT_OPTIONS.defaults.speedMultiplier,
  cameraMode: EXPORT_OPTIONS.defaults.cameraMode,
  cameraSettings: EXPORT_OPTIONS.defaults.cameraSettings,
  terrainSettings: EXPORT_OPTIONS.defaults.terrainSettings,
});
// addRouteEntities / addPlaybackEntities / startPlayback are NOT called here — done by reloadTrack on first import
updateImportActivityUi({ status: "idle", label: "No activity imported yet." });
```

The `initializeViewerTerrain` call, viewer setup, and UI wiring all remain.

### 1c. Guard all code that reads `playbackState.currentSample`

`updateMetricOverlay`, `updatePlaybackUI`, and any other function that reads
`playbackState.currentSample.*` must null-check before accessing fields:

```js
const sample = playbackState.currentSample;
if (!sample) return;  // no track loaded yet
```

### 1d. Disable export and playback controls when no track loaded

Add a helper `hasTrack(playbackState)` → `playbackState.trackpoints.length > 0`.

In `updatePlaybackUI` and `updateExportUi`, disable/grey out the relevant buttons when
`!hasTrack(playbackState)`.

---

## Part 2 — IPC: load a trace from a file path (drag-and-drop)

The existing `activity-import` handler opens a file picker. For drag-and-drop we already have the
path on the renderer side, but we still need to parse the file in the main process (Node.js file
access). Add a new IPC handler that accepts a path directly.

### 2a. Main process (`main.js`)

```js
// F-71: load an activity file from a known path (used by drag-and-drop).
ipcMain.handle("activity-load-path", async (_event, filePath) => {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error("Invalid file path.");
  }
  const trackData = await loadActivityFile(filePath);
  return { cancelled: false, trackData };
});
// end F-71
```

### 2b. Preload (`preload.js`)

```js
// F-71: load an activity from a given file path (drag-and-drop path, not file-picker).
loadActivityFromPath(filePath) {
  return ipcRenderer.invoke("activity-load-path", filePath);
},
// end F-71
```

---

## Part 3 — IPC: open a new window pre-loaded with a trace

### 3a. Main process (`main.js`)

Add a `Map` to track pending activities for new windows. Augment `renderer-ready` to push the
pending activity to the new window as a `load-activity` event.

```js
// F-71: keyed by webContents.id; holds the file path to push once the window is ready.
const pendingWindowActivity = new Map();

// In ipcMain.handle registration:
ipcMain.handle("open-with-activity", async (_event, filePath) => {
  // F-71: open a second preview window and pre-load it with the given trace.
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#06121d",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  pendingWindowActivity.set(win.webContents.id, filePath);
  await win.loadFile(rendererPath, { query: { mode: "preview" } });
  return { opened: true };
});
// end F-71
```

Augment the existing `renderer-ready` handler to push pending activities:

```js
ipcMain.on("renderer-ready", (event) => {
  console.log("BikeFlyOver renderer ready.");

  // F-71: if this window was opened for a specific trace, push it now.
  const pendingPath = pendingWindowActivity.get(event.sender.id);
  if (pendingPath) {
    pendingWindowActivity.delete(event.sender.id);
    event.sender.send("load-activity", { filePath: pendingPath });
  }
  // end F-71

  if (isSmokeTest) {
    setTimeout(() => { app.quit(); }, 500);
  }
});
```

### 3b. Preload (`preload.js`)

```js
// F-71: open a new window and pre-load it with the given trace file.
openWithActivity(filePath) {
  return ipcRenderer.invoke("open-with-activity", filePath);
},
// F-71: subscribe to the "load this activity" push event (sent to new windows pre-seeded with a trace).
onLoadActivity(listener) {
  return subscribe("load-activity", listener);
},
// end F-71
```

### 3c. Renderer (`renderer.js`) — wire up the push event

In `setupImportActivityControls` (or at the end of `initializeApp`), subscribe once:

```js
// F-71: handle the push from main when this window was opened for a specific trace.
window.bikeFlyOverApp.onLoadActivity(async ({ filePath }) => {
  try {
    const result = await window.bikeFlyOverApp.loadActivityFromPath(filePath);
    if (result?.trackData?.trackpoints?.length) {
      currentActivityFilePath = result.trackData.filePath;
      reloadTrack(viewer, playbackState, result.trackData);
    }
  } catch (err) {
    updateImportActivityUi({ status: "error", label: String(err?.message ?? err) });
  }
});
// end F-71
```

---

## Part 4 — Drag-and-drop handler and confirmation dialog

### 4a. HTML: confirmation modal (`index.html`)

Add a modal overlay to `index.html`. It should be hidden by default and shown/hidden programmatically.

```html
<!-- F-71: drag-and-drop trace confirmation dialog -->
<div id="traceDropModal" class="modal-overlay" hidden>
  <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="traceDropModalTitle">
    <h2 id="traceDropModalTitle">Import new activity trace?</h2>
    <p id="traceDropModalBody"></p>
    <p id="traceDropModalWarning" class="modal-warning" hidden></p>
    <div class="modal-actions">
      <button id="traceDropRefuse">Refuse</button>
      <button id="traceDropAcceptThis">Accept in this window</button>
      <button id="traceDropAcceptNew" class="modal-btn-primary">Accept in new window</button>
    </div>
  </div>
</div>
<!-- end F-71 -->
```

### 4b. CSS: modal styles (`styles.css`)

```css
/* F-71: trace drop confirmation modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-overlay[hidden] { display: none; }
.modal-box {
  background: #0d2435;
  border: 1px solid #2a4a60;
  border-radius: 6px;
  padding: 24px;
  max-width: 460px;
  width: 90%;
  color: #d8ecf8;
}
.modal-box h2 { margin: 0 0 12px; font-size: 1rem; }
.modal-box p  { margin: 0 0 8px; font-size: 0.875rem; line-height: 1.5; }
.modal-warning { color: #f5a623; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
.modal-btn-primary { font-weight: bold; background: #1a6fa8; color: #fff; border: none; }
/* end F-71 */
```

### 4c. Renderer: drag-and-drop logic (`renderer.js`)

Add a `setupTraceDropHandler(viewer, playbackState)` function called from `initializeApp` at the
end of the preview-mode block. The function:

1. Listens for `dragover` and `drop` on `window` (or `document`).
2. Filters dropped files for trace extensions.
3. Prevents default browser handling.
4. Loads the track data via IPC.
5. Checks media-date overlap.
6. Shows the modal.

```js
// F-71: detect trace file extensions in a dropped file list.
const TRACE_EXTENSIONS = new Set([".tcx", ".gpx", ".fit"]);

function getDroppedTraceFile(dataTransfer) {
  for (const file of dataTransfer.files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (TRACE_EXTENSIONS.has(ext)) {
      return file;  // file.path is available in Electron
    }
  }
  return null;
}

// F-71: check if any loaded media items fall within the new trace's time range.
// Returns an object with overlap info used to build the warning message.
function checkMediaDateOverlap(mediaItems, trackData) {
  const itemsWithTimestamp = mediaItems.filter(
    (item) => Number.isFinite(item.capturedAtTimestamp),
  );
  if (itemsWithTimestamp.length === 0) return { hasMedia: false };

  const traceStart = trackData.trackpoints[0].timestamp;
  const traceEnd   = trackData.trackpoints[trackData.trackpoints.length - 1].timestamp;
  const overlapping = itemsWithTimestamp.filter(
    (item) => item.capturedAtTimestamp >= traceStart && item.capturedAtTimestamp <= traceEnd,
  );

  return {
    hasMedia: true,
    totalWithTimestamp: itemsWithTimestamp.length,
    overlapping: overlapping.length,
    traceStart,
    traceEnd,
  };
}

function setupTraceDropHandler(viewer, playbackState) {
  document.addEventListener("dragover", (e) => {
    if (getDroppedTraceFile(e.dataTransfer)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  document.addEventListener("drop", async (e) => {
    const file = getDroppedTraceFile(e.dataTransfer);
    if (!file) return;
    e.preventDefault();

    // Load the track data first so we have its date range for the warning check.
    let trackData;
    try {
      const result = await window.bikeFlyOverApp.loadActivityFromPath(file.path);
      if (!result?.trackData?.trackpoints?.length) {
        setStatus("Dropped file has no trackpoints.");
        return;
      }
      trackData = result.trackData;
    } catch (err) {
      setStatus(`Could not read trace: ${err?.message ?? err}`);
      return;
    }

    const overlap = checkMediaDateOverlap(mediaLibraryState.items, trackData);
    showTraceDropModal(viewer, playbackState, trackData, overlap);
  });
}
// end F-71
```

### 4d. Renderer: modal logic (`renderer.js`)

```js
// F-71: show the 3-option confirmation modal for a drag-and-drop trace import.
function showTraceDropModal(viewer, playbackState, trackData, overlapInfo) {
  const modal   = document.getElementById("traceDropModal");
  const bodyEl  = document.getElementById("traceDropModalBody");
  const warnEl  = document.getElementById("traceDropModalWarning");
  const refuseBtn     = document.getElementById("traceDropRefuse");
  const acceptThisBtn = document.getElementById("traceDropAcceptThis");
  const acceptNewBtn  = document.getElementById("traceDropAcceptNew");

  if (!modal) return;

  const hasExistingTrack = hasTrack(playbackState);
  const mediaCount = mediaLibraryState.items.length;
  const fileName = trackData.fileName;
  const traceStart = new Date(trackData.trackpoints[0].timestamp);
  const traceEnd   = new Date(trackData.trackpoints[trackData.trackpoints.length - 1].timestamp);
  const dateRange  = `${traceStart.toLocaleDateString()} – ${traceEnd.toLocaleDateString()}`;

  bodyEl.textContent = mediaCount > 0
    ? `Import "${fileName}" (${dateRange})? This will replace the current track and discard all ${mediaCount} media item${mediaCount === 1 ? "" : "s"}.`
    : `Import "${fileName}" (${dateRange})? This will replace the current track.`;

  // Show date-mismatch warning if media has no overlap with the new trace.
  if (overlapInfo.hasMedia && overlapInfo.overlapping === 0) {
    warnEl.textContent =
      `⚠ None of your ${overlapInfo.totalWithTimestamp} media item${overlapInfo.totalWithTimestamp === 1 ? "" : "s"} with timestamps overlap this trace's date range — they will be discarded regardless.`;
    warnEl.hidden = false;
  } else {
    warnEl.hidden = true;
  }

  // Default action: "new window" if a track is already loaded, else "this window".
  acceptThisBtn.classList.toggle("modal-btn-primary", !hasExistingTrack);
  acceptNewBtn.classList.toggle("modal-btn-primary",  hasExistingTrack);

  const close = () => { modal.hidden = true; };

  // Replace event listeners to avoid stacking handlers across multiple drops.
  const refuseNew     = refuseBtn.cloneNode(true);
  const acceptThisNew = acceptThisBtn.cloneNode(true);
  const acceptNewNew  = acceptNewBtn.cloneNode(true);
  refuseBtn.replaceWith(refuseNew);
  acceptThisBtn.replaceWith(acceptThisNew);
  acceptNewBtn.replaceWith(acceptNewNew);

  document.getElementById("traceDropRefuse").addEventListener("click", close);

  document.getElementById("traceDropAcceptThis").addEventListener("click", () => {
    close();
    // F-71: clear media and load in the current window.
    mediaLibraryState.items = [];
    mediaLibraryState.alignmentOffsets = {
      cameraOffsetsByCameraId: {},
      mediaOffsetsByMediaId: {},
    };
    currentActivityFilePath = trackData.filePath;
    reloadTrack(viewer, playbackState, trackData);
  });

  document.getElementById("traceDropAcceptNew").addEventListener("click", async () => {
    close();
    try {
      await window.bikeFlyOverApp.openWithActivity(trackData.filePath);
    } catch (err) {
      setStatus(`Could not open new window: ${err?.message ?? err}`);
    }
  });

  modal.hidden = false;
}
// end F-71
```

---

## Part 5 — Guards and graceful empty-state handling

### 5a. `updateMetricOverlay` (renderer.js)

Early-exit when `playbackState.currentSample` is null:

```js
function updateMetricOverlay(playbackState) {
  if (!playbackState.currentSample) return; // F-71: no track loaded
  // ... rest unchanged
}
```

### 5b. `updatePlaybackUI` (renderer.js)

Early-exit or render a "no track" stub:

```js
function updatePlaybackUI(playbackState) {
  if (!hasTrack(playbackState)) {
    // disable playback controls
    setTextContent("playbackStatus", "No activity loaded");
    // disable the play button, slider, etc.
    return;
  }
  // ... existing code unchanged
}
```

### 5c. Export initiation

In `populateExportControls` / the export start handler, disable the export button when
`!hasTrack(playbackState)`.

### 5d. `renderSummary` (renderer.js)

Guard against null `sampleTrack` / empty trackpoints before generating HTML.

---

## Part 6 — `reloadTrack` used as first-track loader

`reloadTrack` already calls `viewer.entities.removeAll()` (safe on an empty entity collection) and
fully initializes route entities, playback state, etc. It can be used both as the "first load" and
as a "replace existing track" operation without changes.

The only required change: on the first load from a "new window" IPC push (`onLoadActivity`), ensure
`currentActivityFilePath` is set before calling `reloadTrack`.

---

## Files changed

| File | Change |
|---|---|
| `src/renderer/renderer.js` | `createPlaybackState` empty-guard, `initializeApp` no default track, `hasTrack` helper, `setupTraceDropHandler`, `showTraceDropModal`, `checkMediaDateOverlap`, `getDroppedTraceFile`, `onLoadActivity` wiring, guards in metric/playback/export UI functions |
| `src/renderer/index.html` | Add `#traceDropModal` HTML |
| `src/renderer/styles.css` | Add `.modal-overlay` / `.modal-box` / `.modal-warning` / `.modal-actions` CSS |
| `src/main/main.js` | Add `activity-load-path` handler, `open-with-activity` handler, `pendingWindowActivity` map, augment `renderer-ready` |
| `src/main/preload.js` | Expose `loadActivityFromPath`, `openWithActivity`, `onLoadActivity` |

---

## Edge cases and notes

- **Multiple files dropped**: only the first trace-extension file is used; other files are ignored.
  A future feature can extend this to support multi-segment import.
- **Non-trace files only dropped**: the handler ignores the event entirely; the browser's default
  drop handling is also prevented to avoid navigating away.
- **"Accept in new window" while no track loaded**: still works (creates a new window with the trace);
  the current window remains empty. The "default" button merely switches to match the common case.
- **Media date warning threshold**: the warning fires only when *zero* media items with timestamps
  overlap the new trace. Partial overlap (some items outside range) is not warned about here; the
  existing out-of-range UI in the media library already surfaces that after import.
- **`file.path` availability**: In Electron, `File` objects obtained from a drag-and-drop event
  have a `.path` property (node-style absolute path). This is Electron-specific and works within
  the renderer process even with `contextIsolation: true`.
- **Export window**: drag-and-drop and the modal are only wired up in `RENDER_MODE === "preview"`.
  The export window (`mode=export`) does not need this handler.
