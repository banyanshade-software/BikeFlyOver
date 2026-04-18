# impl_v2_F75 - Truncate timeline and export only a selected range

## Goal

Allow the user to select a subrange of the activity timeline, preview only that range, and export only that range.

## Current state

- Playback state tracks only the full activity start/end timestamps.
- The timeline slider scrubs across the full activity.
- Restart and playback end conditions are based on the full activity.
- Export timing is deterministic, but shared export timeline generation still assumes the full activity range.
- There is no UI to define a working/export range.

## Implementation approach

1. Treat F-75 as a shared **working range** for both preview and export.
2. Keep full-track timestamps in state, but add an active range start/end that can be narrower.
3. Add simple timeline controls to set/reset the range:
   - range start
   - range end
   - reset to full track
4. Make playback, restart, scrubbing, and export frame math all clamp to the active range.
5. Keep the range deterministic by expressing it directly in timestamps and passing those timestamps into shared export helpers.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/shared/export.js`
- `src/main/main.js`
- `requirement_v1_v2.md`

## Key tasks

- Extend playback state with selected range start/end timestamps and derived duration.
- Add timeline UI controls for selecting and resetting the working range.
- Update slider conversion, scrubbing, restart, and playback-end logic to use the active range.
- Pass the selected range through export settings.
- Trim shared export timeline construction to the selected range so frame count and activity timestamp mapping remain consistent.
- Ensure media presentation within export also respects the selected range.

## Acceptance criteria

- The user can define a start and end point smaller than the full activity.
- Preview playback and scrubbing operate only inside the selected range.
- Restart returns to the selected range start, not always the activity start.
- Export renders only the selected range.
- Export frame count and activity timestamp mapping remain deterministic.
- Resetting the range restores full-activity playback and export.

## Dependencies

- Builds on the existing timeline slider (`F-08`) and scrubbing behavior.
- Extends the deterministic export-timeline work from `F-64`.
- Related to export UX improvements such as `F-29` and `F-30`.
