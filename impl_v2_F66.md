# impl_v2_F66 - Small map inset in the video

## Goal

Add a small north-up map inset that shows the whole track during preview/export.

## Current state

- The main viewer already shows the route in Cesium.
- There is no secondary map or inset overlay in the current UI or export output.

## Implementation approach

1. Add a compact inset map overlay for v2:
   - north-up orientation
   - full-track framing
   - current position marker
2. Render it as an overlay that can appear in both preview and export.
3. Keep the initial implementation simple and stable:
   - static full-route framing
   - moving position marker
   - minimal styling

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Decide whether the inset is a second Cesium view, a 2D SVG/canvas route map, or a lightweight custom rendering.
- Render the full route and current marker in the inset.
- Keep north fixed upward.
- Ensure export captures the inset reliably.

## Acceptance criteria

- A small map inset can be shown in preview/export.
- The whole route remains visible in the inset.
- The current position updates correctly as playback progresses.

## Dependencies

- Builds on current route and playback state.
- Related to `F-23` to `F-26` because it is another exportable overlay element.
