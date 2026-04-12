# impl_v1_F19 - Read EXIF and timestamp metadata from photos and videos

## Goal

Extract capture timestamps from imported media so BikeFlyOver can align them with the activity.

## Current state

- No media import pipeline exists yet.
- No metadata extraction exists for images or videos.

## Implementation approach

1. Build metadata extraction as a separate service behind the media import flow.
2. Use dedicated libraries/tools rather than hand parsing:
   - image EXIF: lightweight EXIF reader such as `exifr`
   - video timestamps: metadata extraction via ffprobe-compatible tooling or a dedicated npm wrapper
3. Normalize extracted timestamps into a common structure:
   - original timestamp string
   - parsed UTC timestamp
   - source field used
   - confidence / fallback status
4. Surface failures explicitly so the UI can later ask for manual correction.

## Main files

- `src/main/main.js`
- `src/main/preload.js`
- new shared/media metadata module(s)
- `src/renderer/renderer.js`

## Key tasks

- Define supported metadata fields in priority order.
- Add extraction during or immediately after import.
- Persist normalized metadata in the in-memory media model.
- Flag missing/invalid timestamps clearly.

## Acceptance criteria

- Imported photos get a parsed capture timestamp when EXIF data is present.
- Imported videos get a parsed timestamp when metadata is available.
- Missing metadata is visible to the user and does not fail silently.

## Dependencies

- Depends on `F-18`.
- Feeds `F-20`.
