# impl_v2_F15 – Predefined camera moves at selected points

## Goal

Allow the user to place **predefined camera moves** at chosen points on the
track timeline. During playback and export the camera overrides its normal
follow/overview behaviour for the duration of the move, then smoothly returns
to the standard mode.

## Feature summary (from requirement)

> Add predefined camera moves at selected points
> (orbit, rotate around point, cinematic transition)

## Current state

- Follow and overview camera modes exist and work well.
- Camera settings are editable (F-14) and behaviour is adaptive (F-64/F-65).
- There is no mechanism to insert a "special" camera move at a specific
  timeline timestamp.
- Project save/load (F-33/F-34) serialises playback state but does not yet
  have a `cameraMoves` field.

## Move types

| Type | Key | Behaviour |
|---|---|---|
| **Orbit** | `orbit` | Camera revolves in a horizontal circle around the current track position for the configured duration. The orbit centre is the interpolated route position at the trigger time; radius, altitude offset, start angle, and angular speed are configurable. |
| **Look-at** (rotate around point) | `lookAt` | The camera parks at a fixed high position and rotates so it continuously faces the current track position as time progresses. Good for panoramic reveals. Parameters: camera altitude, look-ahead offset in seconds. |
| **Cinematic transition** | `cinematic` | Camera smoothly sweeps from the current track position to a position N seconds ahead on the track, using a high altitude arc. Creates a dramatic "fly-over preview" effect. Parameter: sweep duration and end-offset seconds. |

## Data model

Each camera move is a plain object:

```js
{
  id: string,                   // UUID-style unique id
  type: 'orbit' | 'lookAt' | 'cinematic',
  triggerTimestamp: number,     // milliseconds in track timeline
  durationSeconds: number,      // seconds; default 6 for orbit, 4 for lookAt, 5 for cinematic

  // orbit-specific
  orbitRadiusMeters: number,    // default: followDistanceMeters (e.g. 150)
  orbitAltitudeOffsetMeters: number,  // default: followAltitudeOffsetMeters
  orbitAngularSpeedDegPerSec: number, // default: 45

  // lookAt-specific
  lookAtAltitudeOffsetMeters: number, // default: 300
  lookAtCameraRadiusMeters: number,   // default: 400

  // cinematic-specific
  cinematicEndOffsetSeconds: number,  // how far ahead on track to sweep to; default 30
  cinematicAltitudeMultiplier: number, // how high to arc; default 3 (×followAltitude)
}
```

`playbackState.cameraMoves` is the live array. It is initialised to `[]` in
`createPlaybackState`.

## Implementation approach

### 1 – Shared normaliser (`src/shared/camera-moves.js`)

New file. Exports:
- `normalizeCameraMove(rawMove)` — sanitises one move object, fills in
  defaults, rejects unknown types.
- `normalizeCameraMoves(rawArray)` — maps array through `normalizeCameraMove`.

### 2 – Project persistence (`src/shared/project-state.js`)

Add `cameraMoves: normalizeCameraMoves(rawProject.cameraMoves)` to
`normalizeProjectState`, so F-33/F-34 round-trips the moves automatically.

### 3 – Renderer data model (`src/renderer/renderer.js`)

- Add `cameraMoves: []` field to `createPlaybackState`.
- Add helper `getActiveCameraMove(playbackState)` — returns the first move
  whose window `[triggerTimestamp, triggerTimestamp + durationMs]` contains
  `playbackState.currentTimestamp`, or `null`.

### 4 – Camera override (`src/renderer/renderer.js`)

Add `applyCameraMoveFrame(viewer, playbackState, move, progress)` that
dispatches to type-specific functions:
- `applyOrbitFrame(viewer, playbackState, move, progress)`
- `applyLookAtFrame(viewer, playbackState, move, progress)`
- `applyCinematicFrame(viewer, playbackState, move, progress)`

`progress` is `0..1` within the move duration.

In the existing camera dispatch (called each tick and each export frame), check
`getActiveCameraMove` **before** the normal `updateFollowCamera` /
`setOverviewCamera` path. If a move is active, call `applyCameraMoveFrame`
instead.

### 5 – UI (`src/renderer/index.html` + `src/renderer/renderer.js`)

Add a **Camera Moves** collapsible section (`<details id="sectionDetailsCameraMoves">`)
after the Camera Settings section.

Contents:
- "Add move at current time" button (`addCameraMoveButton`)
- A `<select>` for the move type (`cameraMoveTypeSelect`)
- A compact list `<div id="cameraMovesList">` — each row shows: formatted
  time, type label, duration in seconds, a "✕" delete button
- Clicking a row (or a future edit icon) expands type-specific parameter
  inputs inline

Wire up:
- `setupCameraMovesControls(viewer, playbackState)` called from `initializeApp`.
- `renderCameraMovesList(playbackState)` re-renders the list after any change.
- Add/delete handlers update `playbackState.cameraMoves` and call
  `renderCameraMovesList`.

### 6 – Unit tests (`test/camera-moves.test.js`)

- `normalizeCameraMove` defaults and type coercion
- `normalizeCameraMoves` array handling (empty, null, malformed items)
- `getActiveCameraMove` — returns correct move, returns null outside window,
  handles overlapping windows (first-wins)
- Round-trip through `normalizeProjectState` (cameraMoves field preserved)

### 7 – Requirements update

Mark F-15 as `Implemented` in `requirement_v1_v2.md`.

## Main files

| File | Change |
|---|---|
| `src/shared/camera-moves.js` | **New** – normaliser |
| `src/shared/project-state.js` | Add `cameraMoves` field |
| `src/renderer/renderer.js` | Data model, camera override, UI wiring |
| `src/renderer/index.html` | Camera Moves section |
| `src/renderer/styles.css` | Minor styling for move rows if needed |
| `test/camera-moves.test.js` | **New** – unit tests |
| `requirement_v1_v2.md` | Mark F-15 Implemented |

## Acceptance criteria

- The user can add an orbit, look-at, or cinematic move at the current
  playback position.
- The move appears in the list and is stored in `playbackState.cameraMoves`.
- During preview playback the camera switches to the move behaviour at the
  trigger time and resumes normal mode after.
- Export is deterministic: the same camera override fires at the same frame.
- Moves survive a save/load project cycle (F-33/F-34).
- All existing tests continue to pass; new tests cover normalisation and
  active-move lookup.

## Dependencies

- Builds on F-14 (camera settings) and F-33/F-34 (project save/load).
- F-16 (keyframe-based camera authoring) extends this foundation.
