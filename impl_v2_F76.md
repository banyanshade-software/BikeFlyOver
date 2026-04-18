# impl_v2_F76 - Media animation effects and image fit mode

## Goal

1. Let the user choose among several enter/exit animation effects for photo/video overlays.
2. Default image display to letterbox/pillarbox (no crop), with an optional "Allow crop" toggle that switches to fill-frame mode.

## Current state

- `buildMediaPresentationState()` in `src/shared/media-presentation.js` applies a single hard-coded animation: fade + slide-up (translateY 18→0) + scale (0.94→1) on enter, and fade-out + slide-up (-10px) + slight scale-up (1→1.03) on exit.
- The `normalizeMediaPresentationSettings()` function normalises only `photoDisplayDurationMs`, `enterDurationMs`, `exitDurationMs`, `photoKenBurnsEnabled`, and `photoKenBurnsScale` — no effect or image-fit setting exists yet.
- The overlay `<div>` for images uses `background-image` with `background-size: cover` (always crops to fill).
- There is no UI control to pick an animation style or toggle crop behaviour.

## Implementation approach

### 1. Define animation effects registry (`src/shared/media-presentation.js`)

Add an `MEDIA_ANIMATION_EFFECTS` registry (plain object, each key is an effect id):

| id | Enter behaviour | Exit behaviour |
|---|---|---|
| `slide-up` | fade in + translateY 18→0 + scale 0.94→1 (current) | fade out + translateY 0→-10 + scale 1→1.03 |
| `fade` | fade in only (translateY=0, scale=1 throughout) | fade out only |
| `slide-down` | fade in + translateY -18→0 + scale 0.94→1 | fade out + translateY 0→10 + scale 1→1.03 |
| `slide-left` | fade in + translateX 24→0 | fade out + translateX 0→-18 |
| `zoom` | fade in + scale 0.85→1 | fade out + scale 1→1.1 |
| `none` | instant (opacity always 1, no transforms) | instant |

Export the registry so tests and the renderer can reference it.

### 2. Extend `normalizeMediaPresentationSettings()`

Add two new settings:

- `animationEffect`: string from `MEDIA_ANIMATION_EFFECTS` keys, default `"slide-up"`.
- `imageFit`: `"contain"` | `"cover"`, default `"contain"`.

Add the fields to `MEDIA_PRESENTATION_SETTINGS_FIELDS` in `src/shared/parameter-config.js` with type `"enum"` and `"string"` respectively so they round-trip cleanly.

### 3. Update `buildMediaPresentationState()` to return effect-specific values

Change the function signature to accept the effect id from settings.  
Return:
- `translateY` (existing, now effect-driven)
- `translateX` (new, for slide-left/right effects, 0 otherwise)
- `scale` (existing)
- `opacity` (existing)
- `imageFit` (pass through from settings so renderer doesn't need settings directly)

This keeps the return shape backward-compatible, just extended.

### 4. Update the media overlay in `renderer.js`

`updateMediaPreviewOverlay()` already destructures `{ imageScale, opacity, scale, translateY }` from presentation.  
Extend to also destructure `translateX` (default 0) and `imageFit`.

Apply:
```js
cardElement.style.transform = `translateY(${translateY}px) translateX(${translateX}px) scale(${scale})`;
```

For image fit, set a CSS custom property or class on the overlay card:
```js
imageElement.style.backgroundSize = imageFit === "cover" ? "cover" : "contain";
imageElement.style.backgroundColor = "#000"; // visible when letterboxing
```

`videoElement.style.objectFit` is set to `imageFit` similarly (contains or fills).

### 5. Add UI controls in `index.html`

In the **Media** section, alongside the Ken Burns checkbox, add:

```html
<label class="field-group" for="mediaAnimationEffectSelect">
  <span class="field-label">Animation effect</span>
  <select id="mediaAnimationEffectSelect">
    <option value="slide-up">Slide up (default)</option>
    <option value="fade">Fade only</option>
    <option value="slide-down">Slide down</option>
    <option value="slide-left">Slide left</option>
    <option value="zoom">Zoom</option>
    <option value="none">None (instant)</option>
  </select>
</label>
<label class="checkbox-group" for="photoAllowCropCheckbox">
  <input id="photoAllowCropCheckbox" type="checkbox" />
  <span>Allow crop (fill frame; default is letterbox/pillarbox)</span>
</label>
```

### 6. Wire up controls in `renderer.js`

- Read initial values from `MEDIA_PRESENTATION_DEFAULTS` in `initializeExportUI()`.
- Add `change` listeners for both controls that update a module-level `mediaPresentationSettings` object and call `updateMediaPreviewOverlay()` to show the change immediately.
- Include both settings in `readExportSettings()` / `readMediaPresentationSettings()` so they flow into export.

### 7. Update `requirement_v1_v2.md`

Add F-76 row and mark Implemented once done.

## Main files

- `src/shared/media-presentation.js` — effects registry, `buildMediaPresentationState` signature change
- `src/shared/parameter-config.js` — new fields in `MEDIA_PRESENTATION_SETTINGS_FIELDS`
- `src/renderer/renderer.js` — destructure translateX + imageFit, apply to DOM
- `src/renderer/index.html` — new select + checkbox controls
- `requirement_v1_v2.md`

## Key tasks

1. Add `MEDIA_ANIMATION_EFFECTS` registry to `media-presentation.js`.
2. Add `animationEffect` and `imageFit` to `parameter-config.js` fields and defaults.
3. Update `normalizeMediaPresentationSettings()` to validate and default the two new fields.
4. Update `buildMediaPresentationState()` to return effect-specific `translateX`, `translateY`, `scale`, and `imageFit`.
5. Update `updateMediaPreviewOverlay()` in `renderer.js` to apply translateX and imageFit.
6. Add HTML controls and wire them up in `renderer.js`.
7. Update `requirement_v1_v2.md`.
8. Run tests.

## Notes

- Effect is a global export setting (not per media item) for V2; per-item override can come later.
- `slide-left` exit slides to the left (`translateX 0→-18`) to be consistent. 
- `"none"` effect means `enterDurationMs` / `exitDurationMs` are ignored for transforms but opacity still fades if the durations are non-zero (full fade still applies; the animator just skips positional transforms). This avoids jarring hard cuts on the default timing.
- The `imageFit` default `"contain"` means the existing screenshots will look different (letterboxed instead of cropped) — this is intentional and what the user requested.
