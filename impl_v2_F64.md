# impl_v2_F64 - Adaptive speed for idle or paused segments

## Goal

Improve video pacing by accelerating through idle moments and slow segments automatically.

## Current state

- Export currently uses a fixed speed multiplier or equivalent timing mode.
- The system does not treat stationary or near-stationary moments differently.

## Implementation approach

1. Define a v2 adaptive-speed policy:
   - detect low-speed or idle segments
   - increase time compression there
   - preserve more normal pacing during active movement
2. Keep the policy deterministic and previewable.
3. Expose simple controls rather than a full rule editor.

## Main files

- `src/shared/export.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/main/main.js`

## Key tasks

- Detect idle/near-idle track segments from speed or distance change.
- Translate that into variable export timing.
- Add user controls for adaptive-speed strength or enable/disable behavior.
- Preserve predictable frame-count calculations.

## Acceptance criteria

- Idle or paused segments consume less video time.
- Export timing remains deterministic.
- The user can understand and control whether adaptive speed is active.

## Dependencies

- Builds on current export timing work.
- Related to `F-29` and `F-65`.
