# impl_v1_F67 - Show aligned media in the preview window

## Goal

Show aligned media in the preview window as a simple thumbnail or card when playback reaches the media timestamp.

## Current state

- Media can be imported, timestamped, and aligned to the activity timeline.
- The sidebar lists aligned media, but the Cesium preview does not yet show any active media overlay.
- Playback is already timestamp-driven, so media visibility can follow the current playback timestamp.

## Implementation approach

1. Define a minimal active-media preview rule for v1:
   - one active media item at a time
   - visible when playback is near its aligned timestamp
   - rendered as a simple overlay card in the preview window
2. Add lightweight preview metadata to the media model:
   - preview visibility status
   - previewable source URL
   - active/inactive selection based on current playback time
3. Add a renderer overlay container above the Cesium viewer for media preview.
4. Support a simple first pass:
   - image thumbnail preview for photos
   - basic poster/card presentation for videos
5. Keep preview-only behavior separate from export composition so v1 can validate timing before export insertion work.

## Main files

- `src/renderer/index.html`
- `src/renderer/styles.css`
- `src/renderer/renderer.js`

## Key tasks

- Add an overlay region in the preview window for active media.
- Compute the currently active aligned media item from `playbackState.currentTimestamp`.
- Generate safe renderer-side preview URLs for local files.
- Render a compact thumbnail/card with file name and timestamp context.
- Hide the overlay cleanly when no media is active or while export chrome is disabled.

## Acceptance criteria

- When playback reaches an aligned media timestamp, the preview window shows a thumbnail/card for that media.
- The visible media changes as playback moves through the activity timeline.
- The overlay remains simple, readable, and non-disruptive in the current POC layout.

## Dependencies

- Depends on `F-18`, `F-19`, and `F-20`.
- Foundation for `F-68`.
