# impl_v2_F54 - Automated coverage for parsing, synchronization, export math, and persistence

## Goal

Add automated tests that protect the most failure-prone shared logic behind import, synchronized playback/media timing, export frame generation, and persisted project state.

## Current state

- The repository currently has a smoke test that launches Electron and verifies renderer startup.
- Shared modules already contain pure logic for TCX parsing, media alignment/presentation, and export timeline math.
- Project save/load UI is not implemented yet, but the persisted data shape can still be validated through shared serialization helpers.

## Implementation approach

1. Keep the existing smoke test and add a Node-based automated test layer for shared logic.
2. Cover parsing and synchronization with deterministic fixtures that do not require Electron rendering.
3. Cover export frame math by asserting timeline construction, frame count, and frame-to-activity mapping.
4. Introduce a shared project-state normalization/serialization seam so future save/load work has test coverage from the start.

## Main files

- `package.json`
- `src/io/tcx/parseTcx.js`
- `src/shared/media-alignment.js`
- `src/shared/media-presentation.js`
- `src/shared/export.js`
- `src/shared/project-state.js`
- `test/*.test.js`

## Key tasks

- Add a unit-test command alongside the existing smoke test.
- Add TCX parser coverage for ordering, deduplication, filtering, and summary generation.
- Add synchronization coverage for media alignment and active media selection during playback.
- Add export math coverage for timeline building, frame counts, and frame state transitions.
- Add persistence coverage for normalized project snapshots and JSON round-trips.

## Acceptance criteria

- `npm test` runs both automated logic tests and the existing smoke test.
- Parsing regressions in TCX normalization are caught automatically.
- Media alignment/presentation and export frame mapping are covered by deterministic tests.
- Project-state JSON round-trips are validated even before full save/load UI lands.

## Dependencies

- Builds on existing shared parsing/export/media modules.
- Supports future save/load feature work (`F-33`, `F-34`) and import hardening (`F-53`).
