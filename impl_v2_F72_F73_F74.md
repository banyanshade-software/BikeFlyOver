# impl_v2_F72 + F73 + F74 - Overlay visual improvements

## Goal

Three related v2 overlay polish features, grouped because they all touch the same CSS and overlay rendering pipeline:

- **F-72** - Metric overlay backgrounds should use 50% transparency instead of the near-opaque values currently hardcoded.
- **F-73** - Graphical overlays (especially the speed gauge/speedometer) must scale in proportion to the exported video resolution rather than having fixed pixel dimensions.
- **F-74** - The speed display should offer a text-only mode as an alternative to the graphical dial, with a user toggle to switch between them.

## Current state

- Metric chip backgrounds use `rgba(..., 0.86-0.96)` — nearly opaque, hiding the imagery behind them.
- The speedometer is rendered at a hardcoded `width: 130px` regardless of export resolution; at 4K the gauge appears tiny while at 480p it crowds out the imagery.
- The only speed display is the graphical dial; there is no text alternative.
- All overlay settings are controlled via `src/shared/parameter-config.js` (`OVERLAY_VISIBILITY_FIELDS`, `EXPORT_SETTINGS_FIELDS`) and driven through the shared export/preview settings pipeline.

## Implementation approach

### F-72 — Overlay background transparency

1. Identify every `rgba(..., alpha)` background used in overlay-visible elements:
   - `.metric-chip` backgrounds
   - `.metric-speedometer-card` background
   - `.metric-speedometer` inner gradient (the inactive arc portion)
   - `.metric-overlay` column backgrounds
2. Lower the alpha of each to 0.50.
   - Use a single CSS custom property `--overlay-bg-alpha: 0.5` declared on `.metric-overlay` so there is one value to tune later rather than many hardcoded constants.
   - Replace each hardcoded alpha in overlay-specific rules with `rgba(r g b / var(--overlay-bg-alpha))`.
3. The speedometer's internal radial-gradient also has near-opaque fill stops — update those accordingly.
4. No renderer.js changes needed; this is CSS-only.

### F-73 — Gauge size proportional to export resolution

The speedometer width is currently hardcoded. The approach:

1. Add a CSS custom property `--overlay-gauge-size` on the `.metric-overlay` root element.
2. Default this property to a sensible preview size (`130px`) via CSS.
3. In renderer.js, when export resolution is known (during `applyRendererSettings` / export prepare), compute a proportional gauge size:
   - reference resolution width: 1280px (720p baseline)
   - `gaugeSize = Math.round(referenceGaugePx * (exportWidth / referenceWidth))`
   - clamp between a min (80px) and max (400px)
4. Set `--overlay-gauge-size` on the overlay root via `element.style.setProperty(...)` each time export settings change.
5. In `.metric-speedometer`, replace the hardcoded `width: 130px` with `width: var(--overlay-gauge-size, 130px)`.
6. Add `gaugeReferencePx`, `gaugeMinPx`, `gaugeMaxPx` constants to `src/shared/parameter-config.js`.
7. During preview mode the CSS default applies so preview appearance is unchanged.

### F-74 — Speed text overlay as alternative to graphical gauge

1. Add a new shared overlay setting `speedDisplayMode` with values `"gauge"` (default) and `"text"`.
2. Add the field to `OVERLAY_VISIBILITY_FIELDS` in `src/shared/parameter-config.js`.
3. In the overlay HTML (`index.html`), add a second speed display element inside `metricOverlaySpeedGaugeCard`:
   - Keep the existing `.metric-speedometer` block for gauge mode.
   - Add `<div id="metricOverlaySpeedText" class="metric-speed-text">` for text mode.
4. In `styles.css`, style `.metric-speed-text` as a large readable value block; background consistent with F-72 transparency.
5. In `renderer.js`:
   - Read `speedDisplayMode` from overlay state when updating the overlay.
   - Show/hide gauge vs text element based on the current mode.
   - Set the text value on `metricOverlaySpeedText` alongside the existing gauge update.
6. In the sidebar, add a `<select>` for speed display mode (Gauge / Text) near the speed gauge checkbox.
7. Carry `speedDisplayMode` through the export settings payload so preview and export use the same mode.

## Main files

- `src/renderer/styles.css` — F-72 alpha changes; F-73 `--overlay-gauge-size` on `.metric-speedometer`; F-74 `.metric-speed-text` style
- `src/renderer/index.html` — F-74 `metricOverlaySpeedText` element and sidebar select; no structural changes for F-72 or F-73
- `src/renderer/renderer.js` — F-73 gauge-size computation and `setProperty` during settings apply; F-74 mode toggle in overlay update and settings snapshot/restore
- `src/shared/parameter-config.js` — F-74 `speedDisplayMode` field; F-73 gauge size constants
- `src/shared/export.js` — F-74 `speedDisplayMode` in defaults and normalization

## Key tasks

- F-72: Add `--overlay-bg-alpha: 0.5` on `.metric-overlay`; replace all near-opaque overlay background alphas
- F-72: Update speedometer radial-gradient inactive-arc stop to use the same alpha
- F-73: Add `--overlay-gauge-size` CSS variable; replace hardcoded `width: 130px` on `.metric-speedometer` with `var(--overlay-gauge-size, 130px)`
- F-73: Add `gaugeReferencePx`, `gaugeMinPx`, `gaugeMaxPx` to shared config
- F-73: Compute and set `--overlay-gauge-size` in `applyRendererSettings` from export width; update during export prepare
- F-74: Add `speedDisplayMode` to `OVERLAY_VISIBILITY_FIELDS` with default `"gauge"`; include in export normalization
- F-74: Add `metricOverlaySpeedText` element and `.metric-speed-text` style
- F-74: Add speed display mode `<select>` to sidebar
- F-74: Drive show/hide of gauge vs text from overlay update in renderer
- F-74: Include `speedDisplayMode` in export settings snapshot/restore

## Acceptance criteria

### F-72
- All metric chip and speedometer backgrounds use 50% opacity so route imagery is legible through the overlay.
- A single CSS variable controls the overall overlay background opacity.

### F-73
- At 1280x720 (720p) export the speedometer diameter is the reference size (~130px).
- At 1920x1080 (1080p) the speedometer scales to ~195px.
- At 3840x2160 (4K) the speedometer scales proportionally up to the configured max.
- In preview mode the gauge size is the CSS default (unchanged visually).

### F-74
- A sidebar control lets the user choose between Gauge and Text speed display.
- In Gauge mode the existing dial renders as before (subject to F-72 transparency).
- In Text mode a large, readable speed value replaces the dial.
- The selected mode travels through the export settings payload so export captures the expected style.

## Dependencies

- F-72 is CSS-only; no blockers.
- F-73 requires the export resolution to be available when `applyRendererSettings` runs — already true from the existing export pipeline.
- F-74 depends on `OVERLAY_VISIBILITY_FIELDS` and the shared settings flow established by F-23, F-24, F-25.
- All three should be implemented together since F-72 changes the same CSS blocks touched by F-73 and F-74.
