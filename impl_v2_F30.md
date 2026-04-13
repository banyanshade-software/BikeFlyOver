# impl_v2_F30 - Export summary dialog

## Goal

Show a confirmation summary before export starts, including output path, estimated frame count, and warnings.

## Current state

- Export starts directly after settings are chosen and the save path is confirmed.
- The renderer already knows current export settings, and the main process can compute frame counts.

## Implementation approach

1. Add a lightweight summary step before the export session begins.
2. Present:
   - output path
   - selected resolution/FPS
   - estimated frame count
   - timing mode summary
   - warnings for expensive exports
3. Keep the interaction simple: confirm or cancel.

## Main files

- `src/main/main.js`
- `src/main/preload.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`

## Key tasks

- Compute summary data before export launch.
- Decide whether the summary is renderer-side modal UI or an Electron dialog.
- Add warnings for large frame counts or high resolutions.
- Preserve current cancellation behavior if the user aborts from the summary.

## Acceptance criteria

- The user sees a clear export summary before rendering starts.
- The summary includes frame-count and output details.
- Cancelling at the summary step does not start export work.

## Dependencies

- Builds on the existing export settings and frame-count helpers.
- Benefits from `F-28` and `F-29`.
