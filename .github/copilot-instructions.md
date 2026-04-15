# Copilot instructions for BikeFlyOver

## Repository source of truth

- The committed repository currently only contains `requirements.md`.
- Treat `requirements.md` as the authoritative product and architecture reference until source code and project docs are added.

## Build, test, and lint

- No build, test, or lint commands are defined in the repository yet.
- No single-test workflow is available yet because there is no committed test runner or test suite.

## High-level architecture

- `requirements.md` defines BikeFlyOver as a JavaScript application based on CesiumJS and embedded in an Electron app.
- The main product flow described by the spec is:
  1. Import activity traces (`TCX` and `FIT`) plus photos and videos.
  2. Align those inputs on a shared timeline; photo and video placement is based on EXIF timestamps, with UI support to correct camera/GPS time drift.
  3. Render a 3D fly-over of the route in Cesium with bird-view, first-person view, and predefined camera motions at specific points.
  4. Expose playback, track metrics, camera controls, and export settings in a responsive UI.
  5. Export the composed result as MP4 and allow the project to be saved and loaded locally.
- The spec implies these major implementation areas:
  - trace import, parsing, and segment joining
  - media timestamp alignment
  - camera/viewpoint orchestration
  - overlay rendering for metrics such as speed or heart rate
  - video export
  - local project persistence

## Key conventions

- Keep behavior aligned with `requirements.md`; do not invent alternate product behavior without updating the spec or adding clearer project documentation.
- The intended stack is JavaScript + CesiumJS + Electron. Fit new code, tooling, and structure to that stack unless the repository is explicitly reoriented.
- The spec also mentions deployment on desktop and mobile platforms. Avoid hard-coding desktop-only assumptions without checking whether packaging/runtime expectations have been clarified elsewhere.
- Support both drag-and-drop import and menu-driven import for activity files and media.
- Multiple `TCX`/`FIT` files are expected to be joinable, and transitions between segments should preserve the "fly jump" behavior described in the spec.
- Video export settings should preserve user control over resolution and aspect ratio (`landscape`, `square`, `portrait`).
- Comments should be written in English.

## Feature implementation tagging

- When implementing a specific feature from the matrix/spec, surround each modified JavaScript code block with feature comments using the feature ID.
- Use the pattern `// F-69: short why` before the feature-specific code and `// end F-69` after it, replacing `F-69` with the actual feature being implemented.
- The opening comment must include a short explanation of **why** the code was added or changed, not only what it does.
- Apply this convention to JavaScript code changes only.

## Relevant MCP/tooling guidance

- If MCP servers are configured for this repository later, prefer a Playwright server first. The product is UI-heavy and visual, so future sessions will benefit most from browser-style automation for import flows, timeline controls, camera settings, export options, and project save/load behavior.
