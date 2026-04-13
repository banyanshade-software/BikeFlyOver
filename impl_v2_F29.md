# impl_v2_F29 - Export duration mode

## Goal

Offer a target video duration mode in addition to the current speed-multiplier export control.

## Current state

- Export currently uses speed multiplier to map activity time to video time.
- Users must infer final output length indirectly.

## Implementation approach

1. Add a second export timing mode:
   - speed multiplier
   - target duration
2. Compute the missing value from the activity duration.
3. Keep both modes deterministic and compatible with the existing frame-count logic.

## Main files

- `src/shared/export.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/main/main.js`

## Key tasks

- Extend export settings with an explicit timing mode.
- Add UI controls for target duration.
- Update frame-count and timestamp helpers to support duration mode.
- Validate impossible or zero-duration values clearly.

## Acceptance criteria

- The user can export by target duration instead of speed multiplier.
- Frame count and output timing remain deterministic.
- The UI makes the selected timing mode obvious.

## Dependencies

- Builds on the current export pipeline.
- Pairs naturally with `F-28` and `F-30`.
