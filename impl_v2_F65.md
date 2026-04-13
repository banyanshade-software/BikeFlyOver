# impl_v2_F65 - Adaptive camera movement for rapid direction changes

## Goal

Make the camera behave more intelligently when the route changes direction several times in a short span.

## Current state

- The follow camera is more stable than before, but still uses one general behavior model.
- The app does not yet vary viewpoint strategy based on route complexity.

## Implementation approach

1. Detect local route complexity:
   - heading-change density
   - repeated zig-zag movement
   - steep/complex areas
2. Adjust camera behavior accordingly:
   - move higher for complex turns
   - reduce excessive camera motion
   - smooth transitions between strategies
3. Keep the logic deterministic for export.

## Main files

- `src/renderer/renderer.js`
- possibly `src/shared/export.js`
- `src/renderer/index.html`

## Key tasks

- Measure route complexity around the current playback position.
- Add adaptive camera heuristics on top of current follow-camera math.
- Expose simple enable/strength settings if needed.
- Verify preview/export parity.

## Acceptance criteria

- Camera motion is calmer in rapid direction-change areas.
- Complex turns gain a more readable point of view.
- Export remains deterministic and visually consistent.

## Dependencies

- Builds on `F-14` and the current follow-camera improvements.
- Related to `F-57` and `F-64`.
