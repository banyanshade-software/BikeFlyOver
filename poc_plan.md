# BikeFlyOver minimal POC plan

## Goal

Build a minimal desktop POC from `requirements.md` that:

- runs as a JavaScript app based on CesiumJS inside Electron
- loads the sample TCX file at `samples/activity_22469836126.tcx`
- renders the full track in a 3D Cesium view
- highlights the route so the path is clearly visible
- animates a camera that follows the activity from a 3D point of view

## POC scope

This POC should cover only the smallest vertical slice needed to prove the concept:

1. start an Electron window with a Cesium-based renderer
2. parse one local TCX file bundled with the repo
3. extract trackpoints with latitude, longitude, altitude, and timestamp
4. draw the route in 3D over Cesium terrain/imagery
5. show a moving marker for the current position
6. move the camera so it follows the marker from a trailing 3D perspective
7. visually distinguish completed vs upcoming path, or at minimum render the entire path with a strong highlight color

## Out of scope for the POC

- FIT support
- drag and drop or menu import
- multiple activities or segment joining
- photo/video insertion from EXIF timestamps
- project save/load
- export to MP4
- advanced camera choreography
- overlays for speed, heart rate, or other metrics beyond basic debugging output
- mobile packaging

## Proposed architecture

### 1. Electron shell

- Main process creates a single desktop window.
- Renderer hosts the Cesium viewer and the POC controls.
- Keep preload/API surface minimal; the first version can use static sample data loaded directly by the renderer if that simplifies the path to a working demo.

### 2. TCX ingestion

- Add a small TCX parsing module that converts Garmin XML into a normalized array of trackpoints:
  - `time`
  - `latitude`
  - `longitude`
  - `altitude`
  - optional `distance`
  - optional `speed`
- Ignore laps, heart rate, and extensions except where they are easy to preserve for future use.
- Filter out invalid or duplicate points that would cause camera jitter or zero-length path segments.

### 3. Scene model

- Convert trackpoints into Cesium cartesian positions.
- Build one polyline entity for the route.
- Build one moving entity for the current activity position.
- Keep playback state separate from Cesium entities so later controls can be added without rewriting rendering logic.

### 4. Playback and camera follow

- Create a simple playback clock driven by trackpoint timestamps.
- Support play/pause and restart at minimum.
- Interpolate between points so movement is smooth even when TCX timestamps are uneven.
- Drive the camera from the interpolated position using a trailing offset:
  - look ahead along the route direction
  - stay above the rider position
  - smooth heading/pitch changes to avoid abrupt camera jumps

## Implementation phases

## Phase 1 - App skeleton

- Initialize the JavaScript project structure.
- Add Electron and CesiumJS.
- Create a renderer page that shows a Cesium globe in a desktop window.
- Confirm Cesium assets are wired correctly inside Electron.

**Exit condition:** launching the app opens a Cesium 3D view in Electron.

## Phase 2 - TCX parsing

- Add a parser for `samples/activity_22469836126.tcx`.
- Normalize trackpoints into an internal data model.
- Log summary stats for sanity checks:
  - point count
  - start/end time
  - bounding box
  - min/max altitude

**Exit condition:** the app can read the sample TCX and produce a clean ordered trackpoint list.

## Phase 3 - Static route visualization

- Render the full route on the Cesium globe.
- Zoom the camera to the sample activity bounds on startup.
- Apply a strong visible style for the route highlight.
- Optionally clamp or offset the route relative to terrain based on visual clarity.

**Exit condition:** opening the app shows the sample track clearly in 3D.

## Phase 4 - Moving point and playback clock

- Add a current-position marker moving along the route.
- Add a minimal playback loop using the TCX timestamps or a normalized speed factor.
- Provide minimal controls such as play/pause and restart.

**Exit condition:** the marker traverses the route smoothly from start to finish.

## Phase 5 - Follow camera

- Implement a trailing follow camera tied to the interpolated current position.
- Compute forward direction from adjacent trackpoints.
- Apply smoothing to heading, pitch, and height.
- Keep a fallback overview camera mode for debugging.

**Exit condition:** the user can watch a stable 3D point of view following the track.

## Suggested file/module split

- `src/main/` for Electron main-process bootstrapping
- `src/renderer/` for Cesium viewer and UI
- `src/domain/track/` for normalized trackpoint types and playback logic
- `src/io/tcx/` for TCX parsing
- `src/scene/` for Cesium entity creation and camera behavior

The exact layout can stay small, but parsing, playback state, and scene code should remain separate.

## Key technical decisions

- **Use one fixed sample first:** the POC should hard-wire `samples/activity_22469836126.tcx` before adding general import flows.
- **Prefer normalized trackpoint data:** Cesium rendering should consume a clean internal model, not raw XML nodes.
- **Favor visual clarity over full realism:** for the first demo, a clearly highlighted path and stable camera matter more than perfect physical accuracy.
- **Interpolate playback:** raw point-to-point jumps will look rough on a long TCX file; interpolation is required even for the POC.
- **Keep terrain handling pragmatic:** if terrain clamping causes instability, start with altitude from TCX and add terrain refinement later.

## Acceptance criteria

- App launches in Electron and displays a Cesium 3D scene.
- The sample TCX route is visible and highlighted.
- A marker progresses along the route over time.
- The camera follows that movement from a 3D trailing point of view.
- The demo runs end-to-end without requiring file import, export, or project persistence.

## Likely risks

- Cesium asset/configuration issues inside Electron.
- Camera jitter from noisy or repeated TCX points.
- Uneven timestamps causing non-smooth playback.
- Altitude or terrain mismatches making the path appear underground or floating too high.

## First implementation milestone

Deliver the smallest runnable demo with:

- Electron window
- Cesium globe
- parsed sample TCX
- highlighted route polyline
- moving point
- trailing follow camera

Everything else from `requirements.md` should wait until this slice is working cleanly.
