# impl_v2_F52 - Clear retry and abort handling for imagery/provider failures

## Goal

Handle imagery/provider failures more clearly during preview and export, with retry and abort messaging that the user can understand.

## Current state

- Base imagery failures are logged and reflected in a route status message.
- Export settle logic can fail loudly, but the user-facing messaging is still minimal.

## Implementation approach

1. Promote provider/load failures into clearer renderer-visible state.
2. Differentiate transient loading issues from hard failures.
3. Add explicit retry or abort guidance where the current flow simply fails.
4. Keep export failure messaging consistent with preview/provider issues.

## Main files

- `src/renderer/renderer.js`
- `src/main/main.js`
- `src/renderer/index.html`

## Key tasks

- Expand provider error state handling.
- Add user-facing error copy and action choices where appropriate.
- Make export failures point to whether imagery readiness or encoding failed.
- Keep smoke-test behavior predictable.

## Acceptance criteria

- Provider failures are surfaced clearly to the user.
- The user can understand whether to retry, wait, or abort.
- Export/provider failures are easier to diagnose from the UI.

## Dependencies

- Builds on the current base-layer and export status plumbing.
- Related to `F-30`, `F-31`, and `F-53`.
