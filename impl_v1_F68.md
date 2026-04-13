# impl_v1_F68 - Insert aligned media into the generated video with a simple animation

## Goal

Include aligned media in the exported MP4 so photos/videos appear in the generated video with a simple animation.

## Current state

- Export already captures deterministic frames from the main preview window.
- Media can be imported and aligned on the activity timeline, but export output only shows the map/camera view.
- No media overlay animation exists yet in preview or export.

## Implementation approach

1. Reuse the same active-media timing model as preview:
   - determine which media item is active for a given playback/export timestamp
   - define a short visibility window around the aligned timestamp
2. Render media in a shared overlay layer that is visible in both preview and export capture.
3. Keep the v1 animation intentionally simple:
   - fade in
   - slight scale-up or slide-up
   - hold briefly
   - fade out
4. Support practical first-pass media rendering:
   - images displayed directly
   - videos represented either by a simple poster frame/card or by basic inline playback if stable enough
5. Keep export deterministic:
   - animation state must depend only on activity timestamp
   - avoid real-time CSS timing that diverges between preview and export

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`
- possibly shared media-preview/export timing helpers

## Key tasks

- Define media visibility windows and animation progress from activity timestamp.
- Share overlay rendering logic between preview playback and export-frame rendering.
- Add CSS/renderer state for a simple deterministic media animation.
- Ensure export mode captures the media overlay without reintroducing hidden UI chrome.
- Decide and document the v1 fallback for video media if full inline video playback is too unstable for deterministic export.

## Acceptance criteria

- Exported MP4 includes aligned media overlays at the expected moments.
- The media appears with a simple animation rather than popping in abruptly.
- Preview and export use the same timing rules for when media appears.

## Dependencies

- Depends on `F-18`, `F-19`, `F-20`, and `F-67`.
- Must remain compatible with the current deterministic export pipeline.
