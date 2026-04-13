# impl_v2_F26 - Overlay positioning and style presets

## Goal

Allow users to choose where overlays appear and which visual preset they use.

## Current state

- The current viewer has no general overlay layout controls.
- Media and future metric overlays are rendered in fixed positions.

## Implementation approach

1. Add a minimal preset system:
   - top-left / top-right / bottom-left / bottom-right
   - compact / standard / cinematic styles
2. Keep presets data-driven and shared between preview and export.
3. Avoid arbitrary drag-and-drop in v2; use fixed presets instead.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Define overlay position/style presets.
- Add selection controls in the sidebar.
- Apply preset classes to overlay containers.
- Keep overlay layout compatible with media and export overlays.

## Acceptance criteria

- The user can change overlay location and style preset.
- The selected preset is reflected in preview and export.
- Overlay presets do not break on narrower layouts.

## Dependencies

- Depends on `F-23`.
- Works best after `F-24` and `F-25`.
