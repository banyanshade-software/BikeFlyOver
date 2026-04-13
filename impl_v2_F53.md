# impl_v2_F53 - Import validation for malformed or empty activity files

## Goal

Prevent bad TCX/FIT inputs from entering the workflow silently and show clear validation feedback.

## Current state

- The app currently relies on a bundled sample TCX and media import only.
- TCX parsing exists, but there is limited validation/UI around malformed input.
- FIT import is not implemented yet, but validation needs planning before broader import work lands.

## Implementation approach

1. Define validation rules for:
   - empty files
   - malformed XML/unsupported structure
   - no valid trackpoints
   - unsupported FIT payloads until FIT import is added
2. Surface validation errors in the renderer/import workflow.
3. Keep malformed imports from partially mutating project state.

## Main files

- `src/io/tcx/parseTcx.js`
- future FIT parser/import helpers
- `src/main/main.js`
- `src/renderer/renderer.js`

## Key tasks

- Harden parser error reporting.
- Normalize validation errors into user-facing messages.
- Define how rejected imports appear in the UI.
- Keep successful imports unaffected by validation additions.

## Acceptance criteria

- Empty or malformed files are rejected clearly.
- No invalid trace data is treated as a valid activity.
- Validation errors are visible to the user without silent failure.

## Dependencies

- Closely related to future import work (`F-01`, `F-02`, `F-03`, `F-04`).
- Related to `F-52` and `F-54`.
