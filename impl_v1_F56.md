# impl_v1_F56 - Align markers and played-route altitude strategy with the base track

## Goal

Ensure route markers and playback progress visuals follow the same altitude rule as the main route.

## Current state

- Start/end markers, current marker, and played route are built separately.
- If `F-55` changes the route altitude strategy, these elements can diverge unless updated together.

## Implementation approach

1. Extract a shared position strategy layer for route rendering:
   - base route positions
   - current marker position
   - played-route positions
   - start/end markers
2. Make all visible route elements derive from the same altitude/grounding rule.
3. Keep the implementation explicit rather than hiding behavior in multiple ad hoc conversions.

## Main files

- `src/renderer/renderer.js`

## Key tasks

- Introduce a shared helper for route display coordinates.
- Rewire marker placement and played-route rendering to use that helper.
- Verify transitions remain smooth while playback progresses.

## Acceptance criteria

- Base route, played route, and markers appear aligned visually.
- There is no visible mismatch between route line and current-position marker.
- Camera tracking still uses the intended motion model after the change.

## Dependencies

- Depends on the display strategy chosen in `F-55`.
