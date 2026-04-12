# impl_v1_F18 - Import photos and videos into the project

## Goal

Allow the user to import image and video files into the current session so they can later be placed on the activity timeline.

## Current state

- The POC only loads one bundled sample TCX file.
- No generic project asset model exists yet.
- No import UI exists for media.

## Implementation approach

1. Add a minimal in-memory media library for v1:
   - id
   - file path
   - file name
   - media type (`image` or `video`)
   - timestamp metadata status
2. Add an import action in the control panel and/or application menu.
3. Use Electron main-process file picking and return normalized file descriptors to the renderer.
4. Accept common desktop formats only for v1:
   - images: jpg, jpeg, png, heic if supported
   - videos: mp4, mov
5. Display imported items in a simple list in the sidebar.

## Main files

- `src/main/main.js`
- `src/main/preload.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- possibly a new shared module for project/media state

## Key tasks

- Add IPC for media import.
- Add renderer-side media collection state.
- Render a basic imported-media list with file name and detected type.
- Mark items whose timestamp metadata could not be read yet.

## Acceptance criteria

- The user can select photo and video files from disk.
- Imported media appears in the POC UI without restarting the app.
- The media collection is available for later timestamp alignment work.

## Dependencies

- Foundation for `F-19` and `F-20`.
