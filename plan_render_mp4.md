# BikeFlyOver MP4 render plan

## Goal

Add a first MP4 export pipeline to the current Electron + Cesium POC.

The export must be deterministic and frame-based: for every output frame, the app must advance playback to the exact export timestamp, update the camera and scene state, wait until the visible Cesium tiles are ready, wait until that ready state has actually been rendered, then capture the frame.

## Current state

The POC already has:

- Electron application shell
- Cesium viewer with satellite imagery
- parsed sample TCX playback
- moving marker and route progress styling
- follow and overview camera modes

The current playback loop is interactive and driven by `requestAnimationFrame`, which is not suitable for reliable video export because:

- frame time is not deterministic
- tile loading is asynchronous
- capture could happen before the final imagery for the current camera view is visible
- the current UI layout includes the sidebar, which is not ideal as the export surface

## Minimal export approach

The first implementation should export a numbered PNG frame sequence and then assemble it into MP4 with `ffmpeg`.

This is the safest minimal path because it:

- separates rendering from video encoding
- makes export restart/debug easier
- preserves intermediate frames when something fails
- allows strict per-frame waiting before capture

## Core requirement: only capture settled frames

For each frame, export must follow this sequence:

1. compute the exact playback timestamp for the output frame index
2. update playback state, marker, route progress, and camera using that timestamp
3. request Cesium renders until the current view is fully loaded
4. wait for at least one additional rendered frame after readiness so the loaded tiles are actually drawn
5. capture the frame

The important distinction is:

- **ready** means tile requests for the current view are complete
- **rendered** means the completed tile state has gone through the render pipeline and is visible in the captured frame

The implementation must enforce both.

## Proposed architecture

### 1. Dedicated export window or export mode

Create a dedicated export render path instead of capturing the interactive preview directly.

Recommended minimal design:

- create a second `BrowserWindow` for export
- load the same renderer with an `export` mode flag
- size the window to the requested output resolution
- render only the Cesium viewport, or a dedicated export layout without the sidebar

This keeps export deterministic and avoids capturing debug UI or user interactions.

### 2. Deterministic export controller

Add an export controller owned by the main process and coordinated with the renderer through preload IPC.

Responsibilities:

- start export with settings:
  - output path
  - width / height
  - fps
  - video duration or playback speed mapping
  - camera mode
- create a temporary frame directory
- instruct the renderer to render a specific frame index
- capture that frame after renderer confirmation
- assemble frames into MP4
- report progress and support cancellation

### 3. Renderer-side frame renderer

Split the current interactive playback loop from a new export-only renderer path.

The export path should:

- stop using `requestAnimationFrame` as the source of export time
- expose a function like `renderExportFrame(frameIndex, exportSettings)`
- compute state directly from the exact export timestamp
- update marker, route progress, and camera in one synchronous step
- wait for scene settle before acknowledging readiness to capture

This avoids real-time drift and makes repeated exports reproducible.

## Timestamp model

Define an explicit mapping from output frame index to activity timestamp.

Recommended first version:

- keep the existing playback-speed concept
- derive export duration from track duration and chosen speed multiplier
- compute:
  - `videoTimeSeconds = frameIndex / fps`
  - `activityTimestamp = startTimestamp + videoTimeSeconds * speedMultiplier * 1000`

Clamp the final frame to the activity end time.

This keeps interactive preview and exported motion conceptually aligned.

## Scene settle strategy

This is the most important part of the implementation.

### Public signals to use

Prefer Cesium public APIs and observable state:

- `viewer.scene.globe.tilesLoaded`
- `viewer.scene.globe.tileLoadProgressEvent`
- explicit `scene.requestRender()`
- `scene.postRender` to confirm a render pass completed

### Required settle loop

For each export frame:

1. update playback and camera state
2. call `scene.requestRender()`
3. wait until `globe.tilesLoaded === false` becomes settled back to `true`, or if already `true`, still continue to the next step
4. require at least one extra completed render after `tilesLoaded` is `true`
5. optionally require two consecutive stable checks for extra safety

The exported frame should only be captured after this settle loop succeeds.

### Why one extra render matters

Tile load completion alone does not guarantee that the compositor output already contains the final imagery for that state. Requiring an extra `postRender` after readiness reduces the risk of capturing partially updated imagery.

### Timeout and failure policy

Export should not hang forever on a bad network tile or provider issue.

Plan for:

- per-frame timeout
- clear export error if settle never completes
- optional retry count for the same frame
- abort the whole export on repeated failure

The first implementation should fail loudly rather than silently writing incomplete video.

## Frame capture strategy

Use Electron capture from the main process after the renderer signals that a specific frame is settled.

Recommended first version:

- renderer sends `export-frame-settled` with frame index
- main process captures the export window using `webContents.capturePage()`
- save as `frame-000001.png`, `frame-000002.png`, etc.

Why this is a good first step:

- avoids browser canvas encoding differences in the renderer
- keeps file writing in the main process
- aligns well with IPC-based orchestration

## MP4 assembly

After the PNG sequence is complete:

- run `ffmpeg` from the main process
- assemble frames into H.264 MP4
- use a deterministic naming pattern and explicit `-framerate`

Example shape:

`ffmpeg -framerate <fps> -i frame-%06d.png -c:v libx264 -pix_fmt yuv420p output.mp4`

Implementation detail to decide during coding:

- either require system `ffmpeg`
- or add an npm-managed ffmpeg dependency

For the first cut, the plan should prefer the simplest reliable option for the target environment.

## Module changes

### Main process

Likely additions in `src/main/main.js`:

- export IPC handlers
- export window lifecycle
- frame capture orchestration
- ffmpeg process execution
- progress and cancellation events

### Preload

Extend `src/main/preload.js` with a minimal export API:

- start export
- render next frame
- notify frame settled
- receive progress / cancellation / completion events

### Renderer

Refactor `src/renderer/renderer.js` so these concerns are separate:

- interactive playback loop
- pure playback-state synchronization from a supplied timestamp
- camera update for a supplied sample
- export frame settle loop
- export-mode UI state

This refactor is necessary before MP4 export, otherwise interactive timing and export timing will stay tangled together.

## UI scope for the first version

Keep the UI minimal.

Add:

- one "Export MP4" action
- basic settings:
  - resolution
  - fps
  - speed multiplier or duration
  - camera mode
- status text:
  - current frame / total frames
  - phase: rendering or encoding
  - error message if export fails

Do not expand into a full export workflow yet.

## Implementation phases

## Phase 1 - Export pipeline skeleton

- add export settings model
- add main/renderer IPC for export commands
- create dedicated export window or export layout
- render the same sample scene at a fixed export resolution

**Exit condition:** the app can start an export session and create an isolated render surface for it.

## Phase 2 - Deterministic frame rendering

- extract playback synchronization by explicit timestamp
- remove export dependence on `requestAnimationFrame`
- compute exact frame count and per-frame activity timestamp
- make camera updates reproducible frame-to-frame

**Exit condition:** any requested frame index can be rendered deterministically from data and settings alone.

## Phase 3 - Tile-ready and rendered settle loop

- implement per-frame scene settle logic
- wait for tile loading completion for the current camera view
- wait for at least one extra rendered frame after readiness
- add timeout and failure reporting

**Exit condition:** the renderer can positively report that frame N is safe to capture.

## Phase 4 - Frame capture sequence

- capture each settled frame to PNG
- write frames with stable numbering in a temp directory
- track progress and support cancellation

**Exit condition:** the app can export a complete PNG sequence for the sample activity.

## Phase 5 - MP4 assembly

- invoke ffmpeg on the PNG sequence
- write final MP4 to user-selected output path
- clean temp frames on success
- preserve temp frames on failure when helpful for debugging

**Exit condition:** the app writes a playable MP4 from the sample route.

## Acceptance criteria

- Export runs from start to finish without manual interaction.
- Every captured frame is gated by tile readiness and a confirmed render after readiness.
- The exported MP4 matches the requested resolution and frame rate.
- Playback progression in the output is deterministic across repeated runs with the same inputs.
- Export errors are surfaced clearly instead of producing partial or silently degraded output.

## Risks and notes

- Network-backed imagery may make export time highly variable.
- ArcGIS rate limits or provider failures must abort cleanly.
- The current follow-camera drift issue should be fixed or isolated before relying on export output.
- Interactive and export rendering should not share the same time loop.
- Large exports will require temp-disk management and progress reporting.

## Recommended implementation order

1. refactor playback/camera updates to be timestamp-driven
2. create the export render surface
3. implement the settle loop
4. capture PNG frames
5. assemble MP4 with ffmpeg
6. add minimal export UI and progress feedback

This order reduces risk because the mandatory tile-ready capture rule depends on deterministic per-frame rendering first.
