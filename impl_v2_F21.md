# impl_v2_F21 - UI fields to fix camera/GPS time drift

## Goal

Allow the user to correct time drift between imported media timestamps and the activity timeline.

## Current state

- Media import, timestamp extraction, and basic timeline alignment already exist.
- Alignment currently assumes media timestamps are directly usable.
- There is no UI for shifting media timestamps before alignment.

## Implementation approach

1. Add a simple drift-correction model:
   - global media offset
   - optional separate offset for camera/device clock
2. Expose drift fields in the media section.
3. Recompute aligned media timestamps whenever the offset changes.
4. Keep the v2 scope simple: numeric offsets and immediate preview feedback.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- possibly a shared media-alignment helper

## Key tasks

- Extend media alignment state with user-defined time offsets.
- Add UI fields for positive/negative time correction.
- Re-run alignment after each offset change.
- Surface corrected timestamps and alignment results in the sidebar.

## Acceptance criteria

- The user can shift media timing from the UI.
- Timeline alignment updates without reimporting media.
- Corrected media markers and export timing follow the adjusted offset.

## Dependencies

- Depends on `F-18`, `F-19`, and `F-20`.
- Supports `F-22` and future media composition work.
