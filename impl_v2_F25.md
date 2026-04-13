# impl_v2_F25 - Enable or disable overlays independently

## Goal

Let the user choose which overlays are visible in preview and export.

## Current state

- The app has no dedicated overlay toggles.
- Overlay work introduced by `F-23`/`F-24` will need per-overlay control.

## Implementation approach

1. Add per-overlay enabled flags in renderer state.
2. Add checkbox/toggle controls in the sidebar.
3. Filter rendered overlays based on the enabled set.
4. Reuse the same overlay visibility rules for export.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`

## Key tasks

- Add overlay toggle controls.
- Store enabled/disabled overlay state.
- Update overlay rendering to respect toggles.
- Ensure export snapshots use current toggle values.

## Acceptance criteria

- Each overlay can be turned on or off independently.
- Preview and export match the selected visibility state.
- Disabled overlays do not leave empty layout artifacts.

## Dependencies

- Depends on `F-23`.
- Benefits from `F-24`.
