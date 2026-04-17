# impl_v2_F21 - UI fields to fix camera/GPS time drift

## Goal

Allow the user to correct time drift between imported media timestamps and the activity timeline.

## Current state

- Media import, timestamp extraction, and basic timeline alignment already exist.
- Alignment currently assumes media timestamps are directly usable.
- There is no UI for shifting media timestamps before alignment.

## Implementation approach

1. Add a simple drift-correction model:
   - per-camera offset when camera identity can be extracted from metadata
   - per-media override when finer control is needed
   - per-media-only correction when camera identity is unavailable
2. Expose drift fields in the media section at the appropriate scope.
3. Recompute aligned media timestamps whenever a camera-level or media-level offset changes.
4. Keep the v2 scope simple: numeric offsets and immediate preview feedback.

## Main files

- `src/shared/media-metadata.js`
- `src/shared/media-alignment.js`
- `src/main/preload.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`

## Key tasks

- Audit media metadata so image/video alignment prefers actual shoot/capture timestamps.
- Extend media alignment state with per-camera offsets plus per-media overrides.
- Add UI fields for positive/negative time correction at camera and media scope.
- Re-run alignment after each offset change.
- Surface camera identity, corrected timestamps, and alignment results in the sidebar.

## Acceptance criteria

- The user can shift media timing from the UI.
- Timeline alignment updates without reimporting media.
- Corrected media markers and export timing follow the adjusted offset.

## Dependencies

- Depends on `F-18`, `F-19`, and `F-20`.
- Supports `F-22` and future media composition work.

## Implementation notes

- Added shared metadata parsing helpers so image/video alignment prefers actual shoot/capture timestamps and extracts camera identity when possible.
- Replaced the original library-wide offset model with per-camera offsets plus per-media overrides, with per-media-only correction for unidentified files.
- Offset edits now re-align imported media immediately, update preview markers, and feed the export payload through the same aligned media items.
