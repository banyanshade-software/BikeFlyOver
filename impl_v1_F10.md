# impl_v1_F10 - Richer timeline header

## Goal

Improve the playback information area so the user can read the current position in the activity more clearly.

## Current state

- The POC shows status, progress percentage, current time, and speed multiplier.
- Duration and richer timeline context are missing.

## Implementation approach

1. Expand the playback information block to include:
   - elapsed time
   - total duration
   - current activity timestamp
   - progress percentage
   - optional current distance if present in track data
2. Reuse `playbackState.startTimestamp`, `endTimestamp`, `durationMs`, and `currentSample`.
3. Add small formatting helpers for elapsed duration and total duration.
4. Keep the display compact so it still fits the current sidebar layout.

## Main files

- `src/renderer/index.html`
- `src/renderer/renderer.js`

## Key tasks

- Add display fields to the playback section.
- Create helpers for `HH:MM:SS` style elapsed formatting.
- Update `updatePlaybackUI()` to populate all new fields.
- Ensure the values update both during normal playback and after manual seeking from `F-08`.

## Acceptance criteria

- The user can see elapsed time and total duration at a glance.
- The displayed values update correctly during playback and after a seek.
- The layout remains readable at the current sidebar width.

## Dependencies

- Pairs naturally with `F-08`, but can be implemented independently once playback timing is available.
