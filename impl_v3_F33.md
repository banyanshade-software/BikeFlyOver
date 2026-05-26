# impl_v3_F33 — Project save and load (F-33 + F-34)

## Goal

Persist a BikeFlyOver editing session to a local `.bfov` JSON file (F-33) and restore it later
(F-34), so users can close the app and resume exactly where they left off — same track, same media
library, same camera/terrain/overlay configuration, same playback position.

## Background

### Prior state

- `src/shared/project-state.js` already defines the full serialization schema
  (`normalizeProjectState`, `serializeProjectState`, `deserializeProjectState`) created as part of
  F-54 (automated tests for project persistence).
- `test/project-persistence.test.js` already has 2 unit tests for the schema roundtrip.
- The renderer has `reloadTrack()` which replaces the active track in-place, preserving all
  closure references.
- The existing `activity-import` IPC pattern (`main.js` handler → preload bridge → renderer call)
  is the established model for file dialogs.

### Gap: `mediaAlignmentOffsets` missing from schema

`mediaLibraryState.alignmentOffsets` holds per-camera and per-media GPS/camera time-drift
corrections (F-21). It is not yet included in `normalizeProjectState`. It must be added before
save/load can fully restore the media timeline alignment.

## File map

| File | Change |
|---|---|
| `src/shared/project-state.js` | Add `mediaAlignmentOffsets` field to `normalizeProjectState` |
| `src/main/main.js` | `project-save` + `project-load` IPC handlers |
| `src/main/preload.js` | `saveProject()` + `loadProject()` context bridge methods |
| `src/renderer/renderer.js` | `collectProjectState()`, `restoreProjectState()`, button wiring |
| `src/renderer/index.html` | Save Project / Load Project buttons in Import section |
| `test/project-persistence.test.js` | Test for `mediaAlignmentOffsets` roundtrip |

## Implementation plan

### 1. Schema: add `mediaAlignmentOffsets` (`src/shared/project-state.js`)

Import `normalizeMediaAlignmentOffsets` from `../shared/media-alignment`. Add to
`normalizeProjectState`:

```js
mediaAlignmentOffsets: normalizeMediaAlignmentOffsets(rawProject.mediaAlignmentOffsets),
```

This normalizes the `{cameraOffsetsByCameraId, mediaOffsetsByMediaId}` maps, stripping
non-finite values, and falls back to empty maps when absent.

### 2. IPC: `project-save` (`src/main/main.js`)

Import `serializeProjectState` from `../shared/project-state`.

```js
ipcMain.handle("project-save", async (_event, rawState) => {
  const serialized = serializeProjectState(rawState);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save project",
    defaultPath: "project.bfov",
    filters: [{ name: "BikeFlyOver project", extensions: ["bfov"] }],
  });
  if (result.canceled) return { cancelled: true, filePath: null };
  await fs.writeFile(result.filePath, serialized, "utf-8");
  return { cancelled: false, filePath: result.filePath };
});
```

### 3. IPC: `project-load` (`src/main/main.js`)

Import `deserializeProjectState` from `../shared/project-state`.

```js
ipcMain.handle("project-load", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open project",
    filters: [{ name: "BikeFlyOver project", extensions: ["bfov"] }],
    properties: ["openFile"],
  });
  if (result.canceled) return { cancelled: true };

  const raw = await fs.readFile(result.filePaths[0], "utf-8");
  const projectState = deserializeProjectState(raw);

  // Re-import track (parse fresh from disk)
  let trackData = null;
  if (projectState.track?.filePath) {
    try {
      trackData = await loadActivityFile(projectState.track.filePath);
    } catch { /* missing file — caller handles it */ }
  }

  // Re-import media (regenerate previewUrls + re-read EXIF)
  const mediaFilePaths = projectState.mediaItems
    .map((item) => item.filePath)
    .filter(Boolean);
  const reimportedMediaItems = await normalizeImportedMediaPaths(mediaFilePaths);

  return { cancelled: false, projectState, trackData, reimportedMediaItems };
});
```

### 4. Preload bridge (`src/main/preload.js`)

```js
// F-33: save the current project state to a .bfov file.
saveProject(rawState) {
  return ipcRenderer.invoke("project-save", rawState);
},
// end F-33
// F-34: open a .bfov project file and return the parsed state + re-imported track/media.
loadProject() {
  return ipcRenderer.invoke("project-load");
},
// end F-34
```

### 5. Renderer: `collectProjectState()` (`src/renderer/renderer.js`)

Gathers the complete serializable snapshot of current app state:

- `track`: `{filePath: currentActivityFilePath, fileName, importFormat}` from `window.sampleTrack`
- `mediaItems`: `mediaLibraryState.items` (already in the persisted shape)
- `mediaAlignmentOffsets`: `mediaLibraryState.alignmentOffsets`
- `playback`: `{currentTimestamp, isPlaying: false, cameraMode, cameraSettings, terrainSettings,
  overlayVisibility, speedGaugeMaxKph, speedGaugePeakKph, speedGaugePeakTimestamp,
  speedMultiplier, adaptiveStrength}`
- `exportSettings`: from the existing `collectExportSettings()` helper

### 6. Renderer: `restoreProjectState()` (`src/renderer/renderer.js`)

Applies a loaded project result to the live app:

1. If `loadResult.trackData` exists: call `reloadTrack(viewer, playbackState, loadResult.trackData)`.
2. Replace `mediaLibraryState.items` with `reimportedMediaItems`, then re-inject saved
   `alignedActivityTimestamp` / `alignmentStatus` by matching on `filePath` (the re-import
   re-reads EXIF but discards the project's alignment; patch it back in).
3. Restore `mediaLibraryState.alignmentOffsets` from `projectState.mediaAlignmentOffsets`.
4. Re-apply media alignment to library.
5. Apply saved playback settings onto `playbackState`:
   - camera settings, terrain settings, overlay visibility, speed gauge max, adaptive strength,
     speed multiplier.
6. Seek to saved `currentTimestamp`.
7. Update all UI controls (camera, terrain, overlay, export, media alignment) to reflect
   restored state.
8. Refresh media library presentation.

### 7. HTML buttons (`src/renderer/index.html`)

Add a second button row in the Import section after the activity import row:

```html
<!-- F-33/F-34: project save and load buttons -->
<div class="button-row">
  <button id="saveProjectButton" type="button">Save project…</button>
  <button id="loadProjectButton" type="button">Load project…</button>
</div>
```

### 8. Unit tests (`test/project-persistence.test.js`)

Add a test that round-trips a state with `mediaAlignmentOffsets`:

```js
test("normalizeProjectState preserves mediaAlignmentOffsets", () => { ... });
```

## File extension: `.bfov`

`.bfov` (BikeFlyOver project) is short, distinctive, and unlikely to conflict with other tools.
The file content is plain UTF-8 JSON — users can inspect and hand-edit it.

## Known limitations / not in scope for this iteration

- **F-35** (detect missing files when reopening) is a separate feature. For now, `project-load`
  silently leaves `trackData: null` when the file is missing, and the renderer shows an error.
- Media files that have moved since the project was saved are not automatically re-linked.
- `mediaPresentationSettings` (photo display duration, Ken Burns, animation effect, image fit) are
  currently read from HTML `<input>` elements at export time — they are NOT restored into the DOM
  by `restoreProjectState`. A full implementation should either save and restore these values too
  or wire them into the playback state model. (Deferred.)

## Feature tags

All changed code will be surrounded by `// F-33: <why>` / `// end F-33` and
`// F-34: <why>` / `// end F-34` comments as per the project convention.
