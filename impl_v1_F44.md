# impl_v1_F44 - Progress bars for long-running exports and imports

## Goal

Replace text-only long-operation feedback with visible progress bars for better usability.

## Current state

- Export currently reports text status, phase, and current frame count.
- There is no dedicated import progress UI yet.

## Implementation approach

1. Add a progress bar component to the export section:
   - current phase label
   - numeric frame progress
   - `<progress>` or a styled progress bar
2. Update export IPC payloads so the renderer can compute a percentage.
3. For media import, define a simple placeholder progress pattern even if v1 import is mostly batch-based:
   - scanning files
   - reading metadata
   - alignment complete
4. Keep the text status as a fallback alongside the bar.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/main/main.js`
- `src/renderer/styles.css`

## Key tasks

- Add export progress bar markup.
- Compute export percentage from `currentFrame / totalFrames`.
- Add CSS states for idle, running, encoding, complete, and failed.
- Reuse the same visual component for import later in v1 if media import lands in the same cycle.

## Acceptance criteria

- Export progress is visible as both text and a progress bar.
- The progress bar updates during rendering and encoding.
- Failure and cancellation states remain clear.

## Dependencies

- Improves the UX of current export immediately.
- Supports `F-18` to `F-20` once media import exists.
