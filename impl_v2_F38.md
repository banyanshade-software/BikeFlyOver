# impl_v2_F38 - Collapsible control sections

## Goal

Reduce sidebar clutter by making major control sections collapsible.

## Current state

- Playback, timeline, camera, media, and export sections are always expanded.
- The sidebar is scrollable, but the control surface will continue growing.

## Implementation approach

1. Add collapsible behavior to major sections:
   - Import / Media
   - Timeline / Playback
   - Camera
   - Overlay
   - Export
2. Use native details/summary or a small custom disclosure pattern.
3. Keep section state local to the renderer for v2.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Restructure section headings to support collapse/expand.
- Keep keyboard accessibility intact.
- Ensure progress/status content remains visible when relevant sections are collapsed.
- Preserve export-mode chrome-hiding behavior.

## Acceptance criteria

- Major sections can be collapsed and expanded.
- Collapsing sections reduces clutter without hiding critical state unexpectedly.
- The sidebar remains readable and scrollable.

## Dependencies

- Builds on `F-36`.
- Pairs well with `F-37` and `F-39`.
