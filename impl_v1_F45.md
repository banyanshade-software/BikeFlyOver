# impl_v1_F45 - Cache route-derived geometry and Cartesian positions

## Goal

Reduce repeated route calculations during playback and export.

## Current state

- Base route positions are already precomputed once in `buildRoutePositions()`.
- The played-route polyline rebuilds arrays repeatedly from slices and new Cartesian conversions.
- Marker updates still convert the current sample to Cartesian every refresh.

## Implementation approach

1. Extend `playbackState` with cached geometry helpers:
   - base route Cartesian positions
   - optional played-route scratch arrays
   - cached current sample Cartesian
2. Reduce allocation churn in hot playback/export paths.
3. Keep the implementation simple and measurable:
   - optimize the frequently called path first
   - avoid overengineering data structures before profiling
4. Reuse the cache in both preview and export mode.

## Main files

- `src/renderer/renderer.js`

## Key tasks

- Cache current-sample Cartesian coordinates during interpolation.
- Minimize repeated array slicing in played-route updates.
- Review whether Cesium callback properties can reuse stable arrays safely.
- Keep correctness first; optimization must not break route rendering.

## Acceptance criteria

- Playback and export use fewer repeated Cartesian conversions.
- Route rendering output remains visually identical.
- The code path is clearer about what is cached and why.

## Dependencies

- Helps `F-08`, `F-44`, and export stability by reducing unnecessary work.
