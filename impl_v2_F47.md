# impl_v2_F47 - Optimize export memory usage

## Goal

Reduce memory pressure during large exports, especially with long frame sequences and higher resolutions.

## Current state

- Export captures PNG frames to disk and then invokes ffmpeg.
- The basic design is already disk-based, but large exports can still stress memory through image buffers and per-frame work.

## Implementation approach

1. Audit memory-heavy export steps:
   - capture image handling
   - PNG buffer writes
   - renderer-side export overlays and state
2. Reduce transient allocations where possible.
3. Add guardrails for long-running exports without redesigning the entire export pipeline.

## Main files

- `src/main/main.js`
- `src/renderer/renderer.js`
- possibly `src/shared/export.js`

## Key tasks

- Review per-frame capture and encoding preparation.
- Eliminate unnecessary buffer duplication where practical.
- Consider staged cleanup or batching safeguards.
- Keep failure reporting explicit if limits are exceeded.

## Acceptance criteria

- Large exports avoid obvious unnecessary memory churn.
- Export output remains identical.
- The export path stays reliable for current supported resolutions.

## Dependencies

- Builds on the existing deterministic export pipeline.
- Related to `F-30`, `F-31`, and `F-48`.
