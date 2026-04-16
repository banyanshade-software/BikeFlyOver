# impl_v2_F69 - 3D terrain with configurable vertical exaggeration

## Goal

Render the fly-over on optional real 3D terrain so mountains, valleys, and hills are visible in preview/export when enabled, while letting the user exaggerate terrain relief with a bounded vertical scale control.

## Current state

- The current Cesium viewer uses imagery and route rendering, but the product spec does not yet define real terrain-backed relief as a v2 feature.
- The route already has terrain-related visual fixes (`F-55`, `F-56`), but those fixes assume the current altitude strategy rather than a fully terrain-backed globe.
- There is no user control for enabling/disabling 3D terrain or for terrain exaggeration.

## Implementation approach

1. Add a terrain-backed globe for v2:
   - use a `CesiumTerrainProvider`-style integration
   - keep the requirement provider-agnostic
   - cite an online DEM source such as Copernicus DEM GLO-30 as an example source
2. Add user-facing terrain controls:
   - enable/disable 3D terrain
   - bounded numeric control
   - shared by preview and export
   - safe default that preserves realism
3. Keep route geometry visually grounded:
   - clamp the route to terrain or keep it at a very small fixed offset above terrain
   - ensure the base route, played-route highlight, and current position marker all follow the same strategy
   - do not allow the route to appear below terrain or obviously floating high above it
4. Preserve preview/export parity:
   - use the same terrain source and exaggeration settings in both modes
   - ensure export waits for terrain tiles/readiness consistently with the existing export-settle flow

## Main files

- `src/renderer/renderer.js`
- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/shared/export.js`
- `src/shared/parameter-config.js`
- possibly `src/main/preload.js`

## Key tasks

- Add terrain-provider configuration to the shared settings model.
- Add a terrain enable/disable control and terrain exaggeration parameter in the shared preview/export settings flow.
- Initialize the Cesium globe with terrain enabled instead of imagery-only flat terrain.
- Update route entity creation so route line, played route, and marker heights are derived from terrain consistently.
- Keep a tiny positive offset above terrain to avoid z-fighting when needed.
- Ensure preview and export restore/snapshot the same terrain settings.
- Define failure behavior when terrain data is unavailable, especially for preview/export messaging.

## Acceptance criteria

- The user can enable or disable 3D terrain, with 3D terrain enabled by default.
- Preview shows real 3D terrain relief instead of a flat imagery-only globe when terrain is enabled.
- The user can configure terrain exaggeration with a bounded parameter.
- Mountains and valleys become visually more or less pronounced according to that parameter.
- The route remains on the terrain surface or at a very small intentional offset above it.
- The route never visibly clips below terrain and never floats obviously high above it.
- Preview and export use the same terrain and exaggeration settings.

## Dependencies

- Builds on the current Cesium renderer and export pipeline.
- Related to `F-55` and `F-56` because route altitude consistency must continue to hold with terrain enabled.
- Related to `F-52` because terrain/provider failures need clear handling.
