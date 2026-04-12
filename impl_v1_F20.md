# impl_v1_F20 - Place photos and videos on the route timeline using timestamp alignment

## Goal

Map imported media to the activity timeline automatically from their timestamps.

## Current state

- There is no user timeline yet.
- No media import or metadata extraction exists.
- Playback state is already timestamp-driven, which is a good base for alignment.

## Implementation approach

1. Define a basic media placement model:
   - media item id
   - aligned activity timestamp
   - nearest track index
   - alignment status (`aligned`, `before-start`, `after-end`, `missing-timestamp`)
2. Match media timestamps against activity start/end timestamps.
3. For aligned items:
   - compute the nearest activity timestamp
   - compute nearest trackpoint index or interpolation segment
4. Render aligned media in a simple timeline list for v1.
5. Reserve viewer preview and time-offset correction for later versions.

## Main files

- `src/renderer/renderer.js`
- new shared alignment helper(s)
- UI additions in `src/renderer/index.html`

## Key tasks

- Build alignment helpers from media timestamp to activity timestamp.
- Expose alignment status in the UI.
- Render aligned media ordered by time.
- Show out-of-range media with explicit warnings.

## Acceptance criteria

- Imported media can be listed in time order relative to the activity.
- Media with usable timestamps is aligned automatically.
- Out-of-range or missing-timestamp items are clearly identified.

## Dependencies

- Depends on `F-18` and `F-19`.
- Benefits from `F-08` because the timeline slider makes verification easier.
