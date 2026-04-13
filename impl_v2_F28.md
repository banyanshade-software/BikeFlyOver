# impl_v2_F28 - Explicit aspect preset selection

## Goal

Expose aspect presets directly as landscape, square, and portrait rather than only through resolution labels.

## Current state

- Export already supports multiple resolutions, including landscape, square, and portrait variants.
- Aspect choice is implicit in the current resolution list.

## Implementation approach

1. Split export sizing into:
   - aspect preset
   - resolution choice within that aspect
2. Keep current presets, but organize them more explicitly in the UI.
3. Preserve compatibility with the existing export settings model.

## Main files

- `src/shared/export.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`

## Key tasks

- Group resolution presets by aspect.
- Add an aspect selector to the export section.
- Filter the resolution list by the selected aspect.
- Keep export default selection stable and valid.

## Acceptance criteria

- The user can explicitly choose landscape, square, or portrait.
- Resolution options update to match the chosen aspect.
- Export still uses a valid width/height preset.

## Dependencies

- Extends the current export settings UI.
- Pairs naturally with `F-29` and `F-30`.
