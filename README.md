# BikeFlyOver

Generate cinematic 3D fly-over videos from cycling (and other outdoor sport) activity traces.
Import TCX or FIT files, align photos and videos by EXIF timestamp, customise camera motions,
and export an MP4 with optional speed/heart-rate overlays.

BikeFlyOver runs in two modes:

| Mode | Runtime | Entry point |
|------|---------|-------------|
| **Electron** | Desktop app (macOS, Windows, Linux) | `npm start` |
| **Web** | Any modern browser (no install) | `npm run dev:web` |

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Electron mode](#electron-mode)
4. [Web mode](#web-mode)
5. [Running tests](#running-tests)
6. [Project structure](#project-structure)
7. [Architecture](#architecture)
8. [Web mode – limitations](#web-mode--limitations)
9. [Web mode – browser compatibility](#web-mode--browser-compatibility)

---

## Prerequisites

- **Node.js** 20.19+ (or 22.12+) — required by Vite 8
- **npm** 10+

> Electron mode also works with Node.js 20.18 but you will see a Vite version warning
> when running the web build commands.

---

## Installation

```bash
git clone <repo-url>
cd BikeFlyOver
npm install
```

---

## Electron mode

```bash
# Launch the desktop app
npm start

# Run all tests (unit + smoke)
npm test
```

The Electron app bundles CesiumJS, reads local files through Node.js APIs, and uses
`ffmpeg-static` / `ffprobe-static` to encode MP4 output.

---

## Web mode

The web build uses [Vite](https://vitejs.dev/) and [vite-plugin-cesium](https://github.com/nshen/vite-plugin-cesium).
All activity files and media are loaded from the user's local file system via the
browser File API (no server-side upload).

### Development server

```bash
npm run dev:web
```

Opens a local dev server (default: http://localhost:5173).
Hot-module replacement is active for all `src/web/` and `src/renderer/` modules.

> **Required headers** — `npm run dev:web` automatically serves the pages with:
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: credentialless
> ```
> These headers are required for `SharedArrayBuffer` (used by ffmpeg.wasm for frame-by-frame
> MP4 export). `credentialless` (rather than `require-corp`) is used so that Cesium's
> tile CDN requests are not blocked.

### Production build

```bash
npm run build:web
```

Output is written to `dist/web/`. The bundle includes the Cesium widget assets, the
app JavaScript, and a copy of the MediaInfo WASM binary.

### Preview production build

```bash
npm run preview:web
```

Serves `dist/web/` locally with the same COOP/COEP headers as dev.

### Deploying the web build

Copy the contents of `dist/web/` to any static file host that can set custom HTTP headers.
The two required headers (`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: credentialless`) must be present on all responses, otherwise
ffmpeg.wasm frame-by-frame export will fall back to the MediaRecorder strategy.

---

## Running tests

```bash
npm test          # unit tests + Electron smoke test
npm run test:unit # unit tests only (no Electron)
```

Tests cover shared parsing and alignment modules. The smoke test launches the Electron app
headlessly and checks that it starts without errors.

---

## Project structure

```
src/
  main/           Electron main process + preload (contextBridge)
  renderer/       Shared renderer – renderer.js, styles.css, index.html
  shared/         Pure-JS modules used by both Electron and web
  web/            Web-only entry point and polyfills
    app-api.js        window.bikeFlyOverApp implementation for the browser
    index.html        Vite entry point (mirrors renderer/index.html element IDs)
    media-import.js   File picker + drag-and-drop (replaces Electron dialog)
    media-metadata-web.js  EXIF / video metadata via exifr + mediainfo.js
    export-engine.js  MP4 export via MediaRecorder or ffmpeg.wasm
    stubs/            Node.js built-in stubs for Vite's Rolldown bundler
    public/           Static assets served at /
      samples/        Sample GPX file for the "Load sample" button
      mediainfo/      MediaInfo WASM binary
  io/             Activity file parsers (GPX, TCX, FIT)
test/             Unit tests and smoke test
dist/
  web/            Production web build output (git-ignored)
```

---

## Architecture

### Abstraction boundary: `window.bikeFlyOverApp`

`src/renderer/renderer.js` exclusively calls methods on `window.bikeFlyOverApp`.
It never references Electron IPC or Node.js APIs directly.

- **Electron mode**: `src/main/preload.js` populates `window.bikeFlyOverApp` via
  Electron's `contextBridge.exposeInMainWorld` before the renderer runs.
- **Web mode**: `src/web/app-api.js` is a `type="module"` script loaded *before*
  `renderer.js` in `src/web/index.html`, so `window.bikeFlyOverApp` is available by
  the time the renderer module executes.

This design means that all feature work in `renderer.js` automatically benefits both
modes with no per-mode branching in the shared code.

### Export engine (web mode)

Two strategies are supported, selectable via the **Export strategy** dropdown in the UI:

| Strategy | Output | Notes |
|----------|--------|-------|
| `media-recorder` | WebM (or MP4 on Safari) | Real-time; uses `canvas.captureStream()` + `MediaRecorder`. Fast but the export plays at actual playback speed. |
| `ffmpeg-wasm` | MP4 (H.264) | Frame-by-frame; uses ffmpeg.wasm running in a Web Worker. Requires `SharedArrayBuffer` (COOP + COEP headers). Slower but produces standard MP4. |

The export engine communicates with the renderer via an `ExportBus` event channel:
the engine drives the frame loop by emitting `export-render-frame` events, and the
renderer notifies the engine when each frame has been rendered by calling
`notifyFromRenderer("export-frame-settled")`.

---

## Web mode – limitations

| Area | Limitation |
|------|-----------|
| **Frame capture** | Only the Cesium 3D canvas is captured. HTML overlays (speed meter, heart-rate graph) are not included in the recorded frames because `MediaRecorder` and canvas `toBlob()` cannot composite HTML elements. |
| **MediaRecorder output** | The `media-recorder` strategy produces a WebM file (VP8/VP9) on Chrome/Firefox. Safari produces MP4 (H.264). The file extension is `.webm` on non-Safari browsers. |
| **ffmpeg.wasm** | Requires `SharedArrayBuffer`, which in turn requires the `COOP: same-origin` + `COEP: credentialless` headers. On hosts that cannot set these headers, only the `media-recorder` strategy is available. |
| **FIT files** | FIT binary parsing uses a synchronous parser that runs on the main thread; very large FIT files may briefly freeze the UI. |
| **Project save/load** | Uses the browser's File System Access API (`showSaveFilePicker` / `showOpenFilePicker`) where available; falls back to a download/upload approach on browsers that do not support it. |
| **Local file access** | All file access is explicit (user picks files). The app cannot read arbitrary paths from the filesystem. |

---

## Web mode – browser compatibility

| Browser | Minimum version | Notes |
|---------|----------------|-------|
| Chrome / Edge | 96+ | Full support including `COEP: credentialless` |
| Firefox | 119+ | Full support |
| Safari | 15.4+ | MediaRecorder produces MP4; ffmpeg.wasm requires Safari 16.4+ for `SharedArrayBuffer` |

The app gracefully degrades when `SharedArrayBuffer` is unavailable: the
`ffmpeg-wasm` strategy is hidden and only `media-recorder` is shown.
