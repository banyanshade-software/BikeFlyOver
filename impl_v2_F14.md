# impl_v2_F14 - Editable camera altitude, distance, pitch, and motion parameters

## Goal

Let the user tune the follow/overview camera behavior with explicit parameters instead of relying on fixed hard-coded values.

## Current state

- The app has follow and overview camera modes.
- Follow camera range, pitch, smoothing, and look-ahead behavior are hard-coded in `src/renderer/renderer.js`.
- Export can choose a camera mode, but not camera parameter presets.

## Implementation approach

1. Add a camera settings model for v2:
   - follow distance
   - follow altitude offset
   - pitch
   - look-ahead distance / window
   - smoothing strength
2. Expose those settings in the sidebar as editable controls.
3. Apply settings live in preview and carry them into export rendering.
4. Keep safe defaults and validation so invalid values do not break the camera.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`
- possibly shared export/camera config helpers

## Key tasks

- Extract current camera constants into explicit settings.
- Add renderer-side camera settings state.
- Build compact form controls for the camera section.
- Make follow and overview camera math read from settings instead of fixed values.
- Ensure export uses the same camera settings snapshot as preview.

## Acceptance criteria

- The user can change camera parameters from the UI.
- Camera updates are visible immediately in preview.
- Export respects the edited camera parameters.

## Dependencies

- Builds on the current follow/overview camera implementation.
- Supports `F-15`, `F-64`, and `F-65`.
