# impl_v3_F01 — Activity file import (TCX / GPX / FIT)

## Goal

Replace the hardcoded sample-track loading with a user-driven file-picker so users can import their
own `.tcx`, `.gpx`, and `.fit` activity files (F-01 + F-02).

## Background

### Current state

- The app always loads a fixed sample track: `loadSampleTrack()` is called at renderer init
  (`initializeApp`) and again inside `startExport()` in the main process.
- `src/shared/sample-track.js` already provides `loadActivityFile(filePath)` which dispatches to
  `parseTcxTrack` (TCX) or `parseGpxTrack` (GPX) by extension (F-167).
- Media import follows the established IPC pattern:
  `ipcMain.handle("media-import", ...)` → `dialog.showOpenDialog` → returns serialisable result
  → preload exposes `importMedia()` → renderer calls it on button click.
- F-01 / F-02 should follow the exact same pattern.
- No FIT parser is currently in the project or in `package.json`.

### Relevant files

| File | Role |
|---|---|
| `src/main/main.js` | Main process — IPC handlers, dialog, export runner |
| `src/main/preload.js` | Context bridge — exposes IPC calls to renderer |
| `src/shared/sample-track.js` | `loadActivityFile`, `loadSampleTrack` |
| `src/io/tcx/parseTcx.js` | TCX parser, `summarizeTrackpoints` |
| `src/io/gpx/parseGpx.js` | GPX parser (F-167) |
| `src/renderer/renderer.js` | Renderer logic, playback state, entity management |
| `src/renderer/index.html` | UI layout |
| `test/parse-tcx.test.js` | Reference for test structure |

### Trackpoint model (shared across parsers)

```js
{
  time: "2024-01-01T10:00:05.000Z",
  timestamp: 1704067205000,
  latitude: 46.1001,
  longitude: 6.2001,
  altitude: 410,
  distance: null,        // metres cumulative, or null
  heartRate: null,
  speed: null,           // m/s, or null
  cadence: null,
  temperature: null,
}
```

---

## Part 1 — F-02: FIT file parser

### 1a. Add `fit-file-parser` dependency

```
npm install fit-file-parser
```

`fit-file-parser` is MIT-licensed, has no heavy transitive dependencies, and provides a
simple callback-based API compatible with Node's CommonJS module system.

### 1b. `src/io/fit/parseFit.js` (new file)

`fit-file-parser` parses a `Buffer` synchronously through a callback approach:

```js
const FitParser = require("fit-file-parser");

function parseFitTrack(buffer) {
  // …
}

module.exports = { parseFitTrack };
```

**`parseFitTrack(buffer)`** — receives a Node.js `Buffer` (binary file content):

1. Create a `FitParser` instance with `{ force: true, speedUnit: "m/s", lengthUnit: "m",
   temperatureUnit: "celsius", elapsedRecordField: false, mode: "list" }`.
2. Call `parser.parse(buffer, callback)`. The parser calls back with `(error, data)`.
   - `data.records` contains an array of FIT `record` messages.
3. Map each record to a trackpoint using the field mapping below.
4. Filter invalid points (non-finite lat/lon/alt/timestamp).
5. Sort by timestamp.
6. Remove exact duplicates (same timestamp + lat + lon + alt).
7. Throw `"No valid trackpoints were parsed from the FIT file."` if result is empty.

**FIT record → trackpoint field mapping**

| FIT record field | Trackpoint field | Notes |
|---|---|---|
| `record.position_lat` | `latitude` | FIT stores as semicircles; `fit-file-parser` converts to degrees when `mode: "list"` |
| `record.position_long` | `longitude` | same |
| `record.altitude` | `altitude` | metres (already converted by the parser) |
| `record.timestamp` | `timestamp` / `time` | JS `Date` object; call `.getTime()` |
| `record.distance` | `distance` | metres, or `null` |
| `record.heart_rate` | `heartRate` | bpm, or `null` |
| `record.speed` | `speed` | m/s, or `null` |
| `record.cadence` | `cadence` | rpm, or `null` |
| `record.temperature` | `temperature` | °C, or `null` |

A point is discarded if any of `latitude`, `longitude`, `altitude`, or `timestamp` is non-finite.

### 1c. Extend `src/shared/sample-track.js`

Add FIT dispatch to `loadActivityFile`:

```js
const { parseFitTrack } = require("../io/fit/parseFit");

async function loadActivityFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let trackpoints;
  if (ext === ".fit") {
    const buffer = await fs.readFile(filePath);   // binary — no encoding arg
    trackpoints = parseFitTrack(buffer);
  } else {
    const xml = await fs.readFile(filePath, "utf8");
    trackpoints = ext === ".gpx" ? parseGpxTrack(xml) : parseTcxTrack(xml);
  }
  const summary = summarizeTrackpoints(trackpoints);
  return { fileName: path.basename(filePath), filePath, trackpoints, summary };
}
```

### 1d. `test/parse-fit.test.js` (new file)

Tests mirror `test/parse-tcx.test.js` and `test/parse-gpx.test.js`.

Craft minimal valid FIT binary fixtures using `fit-file-parser`'s own test data or by
writing a small fixture generator (since FIT is binary, the test file should contain a
pre-encoded Buffer literal in a hex string / base64 constant, generated once and committed).

Test cases:
- **Parse with all fields** — FIT with lat/lon/alt/timestamp/hr/cadence/speed/temperature → all
  fields populated correctly.
- **Missing optional fields** — FIT with only lat/lon/alt/timestamp → optional fields `null`.
- **Sort and dedup** — out-of-order points with one duplicate → sorted, duplicate removed.
- **Empty / all-invalid points** — throws standard no-trackpoints message.

---

## Part 2 — F-01: Activity file picker (main process + preload)

### 2a. `src/main/main.js` — add `importActivityFile()`

Add a new function alongside `importMediaFiles()`:

```js
// F-01: open a file picker for activity files so users can replace the sample track.
async function importActivityFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Import activity",
    buttonLabel: "Import activity",
    properties: ["openFile"],
    filters: [
      { name: "Activity files", extensions: ["tcx", "gpx", "fit"] },
      { name: "TCX",  extensions: ["tcx"] },
      { name: "GPX",  extensions: ["gpx"] },
      { name: "FIT",  extensions: ["fit"] },
    ],
  });

  if (result.canceled) {
    return { cancelled: true };
  }

  const filePath = result.filePaths[0];
  const trackData = await loadActivityFile(filePath);
  return {
    cancelled: false,
    trackData,
  };
}
// end F-01
```

`loadActivityFile` is already imported from `../shared/sample-track`.

Register the IPC handler in `app.whenReady()` alongside the other handlers:

```js
ipcMain.handle("activity-import", async () => {
  return importActivityFile();
});
```

### 2b. `src/main/main.js` — use the imported track in `startExport()`

`startExport()` currently hard-codes `loadSampleTrack()`. Pass the activity file path from
the renderer in `settings.activityFilePath` and use it:

```js
// F-01: use the user-imported track if one was selected; fall back to the sample.
const sampleTrack = settings.activityFilePath
  ? await loadActivityFile(settings.activityFilePath)
  : await loadSampleTrack();
// end F-01
```

### 2c. `src/main/preload.js` — expose `importActivity()`

Add alongside `importMedia`:

```js
// F-01: expose file-picker-based activity import to the renderer.
importActivity() {
  return ipcRenderer.invoke("activity-import");
},
// end F-01
```

---

## Part 3 — F-01: Renderer — UI and track reloading

### 3a. `src/renderer/index.html` — Import section

Add a new collapsible section **above** the Playback section:

```html
<!-- F-01: Import section for user-selected activity files -->
<section class="controls-panel" aria-label="Import controls">
  <details id="sectionDetailsImport" class="section-details" open>
    <summary class="section-summary"><h2>Import</h2></summary>
    <div class="button-row">
      <button id="importActivityButton" type="button">Import activity…</button>
    </div>
    <div class="progress-row" id="activityImportProgressRow">
      <progress
        id="activityImportProgressBar"
        class="progress-bar"
        max="100"
        value="0"
      ></progress>
      <span id="activityImportProgressLabel" class="progress-label">No activity loaded</span>
      <span id="activityImportProgressValue" class="progress-value"></span>
    </div>
    <dl class="summary-list summary-list--compact" id="activityImportSummary">
      <div>
        <dt>File</dt>
        <dd id="activityImportFile">Sample activity</dd>
      </div>
      <div>
        <dt>Points</dt>
        <dd id="activityImportPoints">-</dd>
      </div>
      <div>
        <dt>Duration</dt>
        <dd id="activityImportDuration">-</dd>
      </div>
    </dl>
  </details>
</section>
<!-- end F-01 -->
```

### 3b. `src/renderer/renderer.js` — track-state module variable and `reloadTrack()`

Add a module-level variable to track the currently loaded activity path:

```js
// F-01: path of the user-imported activity file; null means the app is using the sample track.
let currentActivityFilePath = null;
// end F-01
```

Add `reloadTrack(viewer, playbackState, newTrackData)` — a helper that replaces the active
track in an already-initialized viewer **without** recreating the viewer or the control
event listeners:

```js
// F-01: replace the active track in-place so existing control closures keep working.
function reloadTrack(viewer, playbackState, newTrackData) {
  // 1. Stop playback.
  stopPlayback(playbackState);

  // 2. Remove old Cesium entities.
  viewer.entities.removeById("sample-route");
  viewer.entities.removeById("sample-route-before-range");
  viewer.entities.removeById("sample-route-after-range");
  viewer.entities.removeById("route-start");
  viewer.entities.removeById("route-end");
  viewer.entities.removeById("current-position-marker");
  viewer.entities.removeById("played-route");

  // 3. Mutate playbackState with new track data (keeps the same object so closures work).
  const newState = createPlaybackState(newTrackData.trackpoints, {
    adaptiveStrength: playbackState.camera.adaptiveStrength,
    speedMultiplier: playbackState.speedMultiplier,
    cameraMode: playbackState.camera.mode,
    cameraSettings: playbackState.camera.settings,
    terrainSettings: playbackState.terrain.settings,
    overlayVisibility: playbackState.ui.overlayVisibility,
    speedGaugeMaxKph: playbackState.ui.speedGaugeMaxKph,
  });
  Object.assign(playbackState, newState);

  // 4. Re-add route + playback entities.
  const { routeBoundingSphere, routeEntity, routePositions } =
    addRouteEntities(viewer, playbackState, newTrackData);
  playbackState.currentSamplePosition = routePositions[0] || null;
  playbackState.camera.routeBoundingSphere = routeBoundingSphere;
  playbackState.camera.routeEntity = routeEntity;
  addPlaybackEntities(viewer, playbackState);

  // 5. Update globals and UI.
  window.sampleTrack = newTrackData;
  window.sampleRouteEntity = routeEntity;
  renderSummary(newTrackData);
  setOverviewCamera(viewer, playbackState);
  setPlaybackTimestamp(viewer, playbackState, playbackState.startTimestamp, {
    deterministicCamera: false,
    updateUi: true,
  });
  updatePlaybackUI(playbackState);
  updateImportActivityUi({ status: "complete", trackData: newTrackData });

  // 6. Re-align media to the new track.
  applyMediaAlignmentToLibrary(playbackState);
  refreshMediaLibraryPresentation(viewer, playbackState);

  startPlayback(viewer, playbackState);
}
// end F-01
```

### 3c. `src/renderer/renderer.js` — `setupImportActivityControls()`

Add a setup function (called from `initializeApp` alongside other `setup*` calls):

```js
// F-01: wire up the Import activity button and keep the import status display up to date.
function setupImportActivityControls(viewer, playbackState) {
  const importActivityButton = document.getElementById("importActivityButton");

  importActivityButton?.addEventListener("click", async () => {
    updateImportActivityUi({ status: "running", label: "Selecting file…" });
    openSectionDetails("sectionDetailsImport");

    try {
      const result = await window.bikeFlyOverApp.importActivity();

      if (result?.cancelled) {
        updateImportActivityUi({ status: "cancelled", label: "Import cancelled" });
        return;
      }

      if (!result?.trackData?.trackpoints?.length) {
        updateImportActivityUi({ status: "error", label: "No trackpoints found" });
        return;
      }

      currentActivityFilePath = result.trackData.filePath;
      reloadTrack(viewer, playbackState, result.trackData);
    } catch (error) {
      updateImportActivityUi({
        status: "error",
        label: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
// end F-01
```

### 3d. `src/renderer/renderer.js` — `updateImportActivityUi()`

```js
// F-01: update the import section status row so users see progress and file details.
function updateImportActivityUi({ status, label, trackData } = {}) {
  const progressEl = document.getElementById("activityImportProgressBar");
  const labelEl   = document.getElementById("activityImportProgressLabel");
  const fileEl    = document.getElementById("activityImportFile");
  const pointsEl  = document.getElementById("activityImportPoints");
  const durationEl = document.getElementById("activityImportDuration");

  if (progressEl) {
    progressEl.value  = status === "complete" ? 100 : status === "running" ? 50 : 0;
    progressEl.dataset.status = status || "idle";
  }
  if (labelEl) {
    labelEl.textContent =
      label ?? (status === "complete" ? "Activity loaded" : "No activity loaded");
  }

  if (trackData) {
    if (fileEl)    fileEl.textContent    = trackData.fileName ?? "-";
    if (pointsEl)  pointsEl.textContent  = trackData.summary?.pointCount ?? "-";
    if (durationEl) durationEl.textContent =
      formatDuration(trackData.summary ? trackData.summary.durationSeconds * 1000 : 0);
  }
}
// end F-01
```

### 3e. `src/renderer/renderer.js` — pass `activityFilePath` to export

In the function that assembles settings for `startExport` (inside `setupExportControls` or
wherever `startExport(settings)` is called), add the file path:

```js
// F-01: include the user-selected activity path so the main process loads the correct track.
activityFilePath: currentActivityFilePath ?? null,
// end F-01
```

### 3f. `src/renderer/renderer.js` — call `setupImportActivityControls` from `initializeApp`

In `initializeApp`, alongside the other `setup*` calls:

```js
setupImportActivityControls(viewer, playbackState);
```

Also seed the import status display from the initial sample track:

```js
// F-01: seed the import UI with the sample track details.
updateImportActivityUi({ status: "complete", trackData: sampleTrack });
// end F-01
```

---

## Implementation order

1. **`npm install fit-file-parser`** — add the dependency.
2. **`src/io/fit/parseFit.js`** — implement FIT parser (F-02).
3. **`test/parse-fit.test.js`** — unit tests for FIT parser.
4. **`src/shared/sample-track.js`** — add FIT branch in `loadActivityFile` (F-02).
5. **`src/main/main.js`** — add `importActivityFile()` + `activity-import` handler + export filePath use (F-01).
6. **`src/main/preload.js`** — expose `importActivity()` (F-01).
7. **`src/renderer/index.html`** — add Import section HTML (F-01).
8. **`src/renderer/renderer.js`** — add `currentActivityFilePath`, `reloadTrack()`, `updateImportActivityUi()`, `setupImportActivityControls()`, wire into `initializeApp` and export call (F-01).
9. **Run `npm test`** — verify all tests pass.

---

## Files changed

| File | Change |
|---|---|
| `package.json` | Add `fit-file-parser` dependency |
| `package-lock.json` | Updated by npm install |
| `src/io/fit/parseFit.js` | **New** — FIT parser |
| `src/shared/sample-track.js` | Add FIT branch in `loadActivityFile` |
| `src/main/main.js` | Add `importActivityFile`, `activity-import` IPC, export filePath use |
| `src/main/preload.js` | Expose `importActivity()` |
| `src/renderer/index.html` | Add Import section |
| `src/renderer/renderer.js` | `reloadTrack`, `updateImportActivityUi`, `setupImportActivityControls`, wire-up |
| `test/parse-fit.test.js` | **New** — FIT parser unit tests |

---

## Out of scope for F-01 / F-02

- Drag-and-drop import (F-03).
- Menu-driven import commands (F-04).
- Multi-file join / segment fly-jump (F-05, F-06).
- Project persistence (F-33, F-34).
- Validation UI for malformed files beyond the existing parser errors (F-43 / F-53).
