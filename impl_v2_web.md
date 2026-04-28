# impl_v2_web — Web Mode (no Electron)

## Goal

Run BikeFlyOver entirely in a browser without Electron, with feature parity: activity
import, media alignment, 3D fly-over preview, and MP4 export.  
Both Electron and web modes are maintained in the same repository.

---

## Current state

- The app is Electron-only.  
- All OS-level capabilities (file dialogs, file-system I/O, frame capture, ffmpeg
  encoding, HEIC conversion) live in `src/main/main.js`.
- The renderer talks to the main process exclusively through `window.bikeFlyOverApp`,
  which is injected by `src/main/preload.js` via Electron's context bridge.
- Shared logic (`src/shared/`) uses CommonJS (`require` / `module.exports`).
- Cesium is loaded as a pre-built UMD bundle from `node_modules/cesium/Build/Cesium/`.

---

## Implementation approach

### Guiding principle

`window.bikeFlyOverApp` already acts as the abstraction boundary.  
Web mode re-implements that same interface in pure browser code (`src/web/app-api.js`)
and loads it as a regular `<script>` in the web entry-point HTML.  
`src/renderer/renderer.js` requires **no structural changes**.

### Bundler

Use **Vite** with `vite-plugin-cesium`.  
Vite handles CommonJS→ESM interop for shared modules transparently.  
Dev server and production build both served from `src/web/index.html`.

### Cesium

Vite's Cesium plugin copies CesiumJS assets to the output directory and sets
`window.CESIUM_BASE_URL` automatically, replacing the hand-rolled `cesium-bootstrap.js`
path currently used in Electron.

### Module system

Shared modules stay as CommonJS.  
Vite's `@rollup/plugin-commonjs` (built-in) resolves them for the browser bundle.

---

## New files

| File | Purpose |
|---|---|
| `src/web/index.html` | Web entry point — loads Cesium via Vite plugin, loads `app-api.js` as a module script, then `renderer.js` |
| `src/web/app-api.js` | Browser implementation of the `window.bikeFlyOverApp` interface |
| `src/web/export-engine.js` | MP4 export pipeline — supports `ffmpeg-wasm` and `media-recorder` strategies |
| `src/web/media-import.js` | File picker + drag-and-drop import; returns the same `mediaItems` shape as Electron |
| `src/web/media-metadata-web.js` | Web replacement for ffprobe — uses `mediainfo.js` for video timestamps and `exifr` for images |
| `vite.config.js` | Vite config: CesiumJS plugin, COOP/COEP headers (required for ffmpeg.wasm SharedArrayBuffer), dev server options |

---

## Modified files

| File | Change |
|---|---|
| `src/shared/sample-track.js` | Make `loadSampleTrack()` environment-aware: use `fs.readFile` under Node/Electron, `fetch()` in the browser |
| `package.json` | Add `dev:web`, `build:web` scripts; add Vite + web-only dependencies |
| `README.md` | Document both modes: Electron quick-start, web quick-start, production build, export strategy config, COOP/COEP requirements |

`src/renderer/renderer.js`, `src/renderer/index.html`, and `src/main/` are **not
changed** — Electron mode must remain fully functional throughout.

---

## `window.bikeFlyOverApp` — web implementation mapping

| Electron (preload.js) | Web (app-api.js) |
|---|---|
| `getExportOptions()` | Same — directly calls shared modules |
| `getMediaAlignmentOptions()` | Same |
| `alignMediaItemsToTrack(...)` | Same |
| `normalizeMediaAlignmentOffsets(...)` | Same |
| `loadSampleTrack()` | `fetch('/samples/…')` instead of `fs.readFile` |
| `importMedia()` | Hidden `<input type="file" multiple>` triggered programmatically; calls `media-import.js` |
| `toFileUrl(file)` | `URL.createObjectURL(file)` (receives a `File` object, not a path) |
| `startExport(settings)` | Delegates to `export-engine.js` |
| `cancelExport()` | Sets a shared cancel flag read by `export-engine.js` |
| `notifyReady / notifyError` | `console.log` / `console.error` (no IPC needed) |
| `notifyExportPrepared / notifyExportFrameSettled` | Resolve/reject internal `Promise`s inside `export-engine.js` (no IPC hop) |
| `onExportStatus / onExportPrepare / …` | `EventTarget`-based event bus wired inside `app-api.js` |

---

## Export pipeline — two strategies

Both strategies are selectable via an `exportStrategy` setting (added to export
settings alongside the existing `timingMode`).  
The renderer's export settings panel exposes a new dropdown for it.

### Strategy A — `ffmpeg-wasm` (default)

- Loads `@ffmpeg/ffmpeg` + `@ffmpeg/util` on first export (lazy import).
- Resizes a hidden `<div>` overlay to export dimensions.
- For each frame: calls `Cesium viewer.scene.render()` deterministically, then
  `canvas.toBlob('image/png')` to get a PNG.
- Pipes PNGs to ffmpeg.wasm → libx264 → MP4 blob.
- Triggers browser download via `<a href=objectURL download>`.
- Requires COOP/COEP headers (served by Vite dev server and documented for
  production deployment).

### Strategy B — `media-recorder`

- Calls `cesiumCanvas.captureStream(fps)` to get a `MediaStream`.
- Creates a `MediaRecorder` over that stream.
- Seeks playback frame-by-frame using the same export-timeline logic.
- Stops recording when the last frame is reached.
- Downloads the resulting `Blob` as MP4 (or WebM, depending on browser codec support).
- No SharedArrayBuffer / COOP requirement; smaller runtime footprint (~0 extra bytes).
- Trade-off: codec and quality depend on the browser; no cross-platform libx264 guarantee.

---

## Media metadata — web replacement for ffprobe

`src/web/media-metadata-web.js` re-implements `extractMediaTimestampMetadata`:

- **Images**: `exifr` already runs in the browser; no change needed.
- **Videos** (MP4/MOV): use `mediainfo.js` (WASM, ~2 MB) to extract the
  QuickTime `creation_time` / `com.apple.quicktime.creationdate` atoms — the same
  fields the Electron version reads from ffprobe output.
- **HEIC**: attempt `libheif-js` (WASM); fall back gracefully to EXIF-only
  timestamp extraction if WASM fails to load.

---

## Cross-origin isolation (COOP/COEP)

`@ffmpeg/ffmpeg` requires `SharedArrayBuffer`, which requires cross-origin isolation.  
The Vite dev server is configured to add the following headers automatically:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Production deployments must add the same headers (documented in README).  
The `media-recorder` strategy has no such requirement.

---

## New dependencies

```
vite                   (devDependency)
vite-plugin-cesium     (devDependency)
@ffmpeg/ffmpeg         (runtime — web only, lazy-loaded)
@ffmpeg/util           (runtime — web only)
mediainfo.js           (runtime — web only, lazy-loaded)
libheif-js             (runtime — web only, optional / lazy-loaded)
```

`ffmpeg-static`, `ffprobe-static`, and `electron` remain in place for Electron mode.

---

## New npm scripts

```json
"dev:web":   "vite serve src/web",
"build:web": "vite build",
"preview:web": "vite preview"
```

Existing `start`, `smoke`, `test:unit`, and `test` scripts are unchanged.

---

## README — new sections to add

1. **Modes** — brief comparison table (Electron vs Web).
2. **Web mode — quick start** (`npm run dev:web`, open browser).
3. **Web mode — production build** (`npm run build:web`, serving requirements, COOP/COEP headers).
4. **Export strategy** — explaining `ffmpeg-wasm` vs `media-recorder`, when to use each.
5. **HEIC photos** — web support caveat (WASM required).
6. **Activity file import** — drag-and-drop or file picker, same TCX/FIT support.

---

## Key tasks

1. Add Vite + web dependencies; add `dev:web` / `build:web` scripts to `package.json`.
2. Create `vite.config.js` with CesiumJS plugin and COOP/COEP dev-server headers.
3. Create `src/web/index.html` mirroring the Electron HTML structure.
4. Create `src/web/app-api.js` implementing the full `window.bikeFlyOverApp` interface.
5. Create `src/web/media-import.js` (file picker + drag-and-drop, calls `media-metadata-web.js`).
6. Create `src/web/media-metadata-web.js` (exifr for images, mediainfo.js for videos, libheif-js for HEIC).
7. Create `src/web/export-engine.js` with `ffmpeg-wasm` and `media-recorder` strategies.
8. Extend export settings (`src/shared/export.js` / `parameter-config.js`) to add `exportStrategy` field.
9. Add `exportStrategy` dropdown to the renderer's export controls panel.
10. Update `src/shared/sample-track.js` to detect browser vs Node environment.
11. Write/update `README.md` with web-mode sections.
12. Verify Electron mode still passes existing tests (`npm test`).

---

## Acceptance criteria

- `npm run dev:web` starts a Vite dev server; the full app loads and is interactive in a modern browser.
- Activity import, media alignment, 3D preview, playback, and all overlay controls work identically to Electron mode.
- MP4 export completes successfully with both `ffmpeg-wasm` and `media-recorder` strategies.
- `exportStrategy` setting persists in the export panel and round-trips through project save/load.
- Electron mode (`npm start`, `npm test`) is unaffected.
- README clearly documents how to run and deploy each mode.

---

## Dependencies on existing features

- Uses the existing `window.bikeFlyOverApp` abstraction boundary (`F-21` onwards).
- Export timeline and frame-state logic (`F-64`) is shared unchanged.
- Media alignment (`F-21`) and media presentation (`F-76`, `F-72/73/74`) are shared unchanged.
- Terrain settings (`F-69`) are shared unchanged.
