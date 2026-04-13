# impl_v2_F60 - Handle resize edge cases for low-resolution exports

## Goal

Prevent preview layout breakage and control glitches when the app resizes for low-resolution exports and then restores.

## Current state

- Export temporarily resizes the main window and then restores preview state afterward.
- The app already includes some resize-safe layout work, but low-resolution exports are still a known edge case.

## Implementation approach

1. Audit the current export prepare/reset cycle for layout assumptions.
2. Preserve and restore any preview-specific layout state that can be disturbed by export resizing.
3. Harden viewer/sidebar sizing logic for very small export resolutions.

## Main files

- `src/main/main.js`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`

## Key tasks

- Recheck minimum-size and content-size transitions.
- Verify viewer and sidebar layout after export reset.
- Ensure low-resolution export settings do not leave controls mis-sized afterward.
- Keep single-window export behavior intact.

## Acceptance criteria

- Low-resolution exports do not break the preview layout after reset.
- Controls remain usable after export completes, fails, or is cancelled.
- Preview state restoration remains predictable.

## Dependencies

- Builds on the current single-window export architecture.
- Related to `F-37`, `F-39`, `F-58`, and `F-59`.
