# impl_v1_F36 - Keep the control panel scrollable

## Goal

Preserve and harden the scrollable sidebar behavior as the UI grows.

## Current state

- `.summary-panel` already uses `overflow: auto`.
- The sidebar currently fits the POC, but new controls are being added steadily.

## Implementation approach

1. Treat scrollability as a non-regression requirement.
2. Verify the layout under:
   - smaller window heights
   - long forms
   - export progress states
3. Improve layout resilience where needed:
   - sticky header or sticky action row if useful
   - consistent spacing between sections
   - safe minimum heights inside the grid layout
4. Keep export-mode and preview-mode behavior separate so export can still hide the chrome.

## Main files

- `src/renderer/styles.css`
- `src/renderer/index.html`

## Key tasks

- Audit parent containers for `min-height: 0` / overflow interactions.
- Ensure the sidebar scrolls instead of the whole app shell.
- Verify controls remain usable on smaller window heights.
- Add CSS comments only if needed to document layout constraints.

## Acceptance criteria

- The control panel remains scrollable at small heights.
- New controls do not push critical actions off-screen permanently.
- Export mode does not regress preview scroll behavior after reset.

## Dependencies

- Supports all future sidebar-heavy features.
