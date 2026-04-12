# impl_v1_F57 - Fix follow-camera drift, jitter, and overshoot

## Goal

Improve the follow camera so it produces stable preview and export output on turns, pauses, and uneven geometry.

## Current state

- The follow camera uses smoothed focus and heading values.
- The current behavior can drift or overshoot, especially around sharp direction changes.
- Export already disables smoothing for deterministic output, which highlights the need for a cleaner preview strategy.

## Implementation approach

1. Separate camera anchor calculation from smoothing policy.
2. Improve heading derivation:
   - ignore tiny noisy direction changes
   - use a stable look-ahead distance or adaptive look-ahead window
   - handle near-zero movement gracefully
3. Refine smoothing:
   - use adaptive smoothing based on turn sharpness
   - reset or damp smoothing after discontinuities
4. Keep export deterministic and preview visually stable, even if their smoothing rules differ.

## Main files

- `src/renderer/renderer.js`

## Key tasks

- Refactor follow-camera math into smaller helpers.
- Add guards for stationary or near-stationary segments.
- Reduce heading oscillation on zig-zag traces.
- Recheck both playback and export camera behavior after the change.

## Acceptance criteria

- Follow camera no longer jitters noticeably on tight turns.
- Camera overshoot is reduced after abrupt direction changes.
- Export frames remain deterministic while preview stays smooth.

## Dependencies

- Benefits from `F-45`.
- Works alongside `F-55` and `F-56` because route presentation and camera quality are tightly coupled.
