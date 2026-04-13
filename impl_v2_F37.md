# impl_v2_F37 - Resizable split layout

## Goal

Allow the user to resize the boundary between the control panel and the Cesium viewer.

## Current state

- The app uses a fixed two-column CSS grid.
- The control panel can scroll, but its width is not user-adjustable.

## Implementation approach

1. Replace the fixed split with a user-adjustable width state.
2. Add a drag handle between sidebar and viewer.
3. Persist the chosen width during the session.
4. Keep export mode separate so preview resizing does not affect capture layout logic unexpectedly.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Add splitter handle markup.
- Store and clamp sidebar width.
- Apply the width dynamically to the layout container.
- Keep small-screen responsive fallback behavior intact.

## Acceptance criteria

- The sidebar can be resized interactively.
- The layout remains usable on small and large windows.
- Export reset/prepare does not leave the preview split layout broken.

## Dependencies

- Builds on `F-36`.
- Related to `F-38`, `F-39`, and `F-60`.
