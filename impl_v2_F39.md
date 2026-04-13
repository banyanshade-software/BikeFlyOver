# impl_v2_F39 - Sticky playback/export status area

## Goal

Keep critical playback/export status visible while the user scrolls the control panel.

## Current state

- The control panel scrolls, but all sections scroll away together.
- Export status and playback controls can move out of view in longer forms.

## Implementation approach

1. Define a compact sticky status/header zone for the sidebar.
2. Include high-value information such as:
   - playback state
   - current export status
   - key actions
3. Keep the sticky area small enough not to crowd the panel.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`

## Key tasks

- Choose which status elements should remain sticky.
- Add sticky positioning inside the scroll container.
- Ensure the sticky region works with collapsible sections and resize behavior.

## Acceptance criteria

- Playback/export status remains visible while scrolling.
- Sticky layout does not break export mode or narrow layouts.
- The control panel still scrolls smoothly.

## Dependencies

- Builds on `F-36`.
- Related to `F-37` and `F-38`.
