# impl_v2_F46 - Reduce unnecessary Cesium renders during idle

## Goal

Improve CPU/GPU efficiency by avoiding needless renders when the preview is idle.

## Current state

- Export already uses request-render mode for deterministic capture.
- Preview still relies on frequent updates driven by playback and UI changes.
- Some overlays and progress updates may cause extra viewer work.

## Implementation approach

1. Audit preview render triggers.
2. Use request-render mode more selectively in preview where safe.
3. Trigger renders only when playback, camera, overlay, or visible UI state changes.
4. Keep export logic separate and untouched where it already works.

## Main files

- `src/renderer/renderer.js`

## Key tasks

- Identify current unconditional render/update paths.
- Decide whether preview can run in `scene.requestRenderMode`.
- Add explicit render requests after meaningful state changes.
- Verify interaction remains responsive.

## Acceptance criteria

- Idle preview causes fewer unnecessary renders.
- Playback and scrubbing remain visually correct.
- Export determinism is unaffected.

## Dependencies

- Builds on `F-45`.
- Related to `F-51`.
