# impl_v1_F08 - Timeline slider for current track position

## Goal

Add a visible timeline slider that represents the current playback position and lets the user move to another point in the activity.

## Current state

- Playback is time-based and driven from `playbackState.currentTimestamp`.
- The UI shows progress and current time as text only.
- `setPlaybackTimestamp()` already exists and can be reused as the core seek primitive.

## Implementation approach

1. Add a timeline section to the renderer UI with:
   - a range input
   - current elapsed time
   - total duration
2. Extend `playbackState` with UI metadata needed for slider updates.
3. Drive the slider value from normalized playback progress during normal playback.
4. On slider interaction:
   - pause playback while dragging
   - compute the target timestamp from the slider ratio
   - call `setPlaybackTimestamp()`
   - optionally resume only if playback was running before the drag
5. Keep export logic unchanged; this feature is preview-only.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`

## Key tasks

- Add slider markup and labels.
- Introduce helper functions for:
  - progress ratio to timestamp
  - timestamp to slider value
  - drag start / drag move / drag end
- Prevent feedback loops so programmatic slider updates do not re-trigger seeking.
- Keep camera and marker updates in sync by reusing existing playback synchronization.

## Acceptance criteria

- The timeline slider is visible in the control panel.
- The slider moves during playback.
- Dragging the slider updates marker, route progress, camera, and displayed time.
- Playback resumes correctly after drag release when appropriate.

## Dependencies

- Supports `F-10` because the richer timeline header can reuse the same timing data.
