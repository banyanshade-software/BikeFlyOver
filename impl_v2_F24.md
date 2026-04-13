# impl_v2_F24 - Support text and graphical overlays

## Goal

Expand overlays beyond plain values to include richer text and graphical presentation.

## Current state

- No general overlay system exists yet beyond the media preview/export layer.
- Metrics can be derived from playback state, but no reusable overlay component model exists.

## Implementation approach

1. Introduce a small overlay component system for v2:
   - text chips
   - grouped stat cards
   - simple graphical elements such as gauges/bars
2. Keep rendering in HTML/CSS overlays rather than moving immediately to canvas.
3. Use a single overlay layout model so preview and export remain synchronized.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Define overlay component types and state shape.
- Create reusable CSS patterns for textual and graphical overlays.
- Map playback metrics into those components.
- Keep the initial set small and easy to maintain.

## Acceptance criteria

- The app can render more than one overlay style.
- Overlays remain stable in preview and export.
- Graphical overlays do not obscure the route excessively.

## Dependencies

- Depends on `F-23`.
- Supports `F-25` and `F-26`.
