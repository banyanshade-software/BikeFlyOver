# impl_v2_F23 - Display activity metrics overlays

## Goal

Render basic activity metrics such as speed, time, distance, and heart rate when available.

## Current state

- The playback header already shows time, distance, and speed in the sidebar.
- No metrics are rendered on top of the preview/export viewport.
- Parsed trackpoints already carry time, distance, and speed fields.

## Implementation approach

1. Define a minimal overlay state model:
   - enabled metrics
   - current values from `playbackState.currentSample`
2. Add a viewport overlay container above Cesium.
3. Render basic metric chips/cards for v2.
4. Keep preview and export overlays consistent by using timestamp-driven renderer state.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Add overlay container markup.
- Build formatting helpers for metric values.
- Render live metric values from playback state.
- Ensure export captures the overlay layer correctly.

## Acceptance criteria

- The viewer shows live metric overlays during playback.
- Export can include the same overlay content.
- Metrics remain readable over imagery.

## Dependencies

- Builds on current playback state and export overlay handling.
- Foundation for `F-24`, `F-25`, and `F-26`.
