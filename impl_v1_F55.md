# impl_v1_F55 - Prevent the track line from floating above ground or terrain

## Goal

Fix the visual issue where the route line appears unnaturally high above the map.

## Current state

- Route and played-route polylines use recorded altitude directly.
- `clampToGround` is currently `false`.
- The app uses imagery plus ellipsoid terrain, so the visualization can feel detached from the visible ground.

## Implementation approach

1. Define a clear route altitude strategy for v1:
   - default preview route should visually hug the ground or stay near it
   - avoid a route floating far above imagery unless that is an explicit mode
2. Evaluate two practical approaches:
   - clamp route polylines to ground where compatible
   - normalize route altitude with a reduced offset or sampled terrain height strategy
3. Apply the same rule consistently to base route, played route, and related markers.
4. Keep export output aligned with preview output.

## Main files

- `src/renderer/renderer.js`

## Key tasks

- Decide the v1 altitude policy.
- Update route entity creation to use the new policy.
- Recheck the appearance in follow and overview camera modes.
- Verify the route still reads clearly against satellite imagery.

## Acceptance criteria

- The route no longer appears to float implausibly high above the ground.
- Preview and export use the same route altitude strategy.
- The line remains readable throughout the track.

## Dependencies

- Closely related to `F-56`.
