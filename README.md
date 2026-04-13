# BikeFlyOver V1

BikeFlyOver is an Electron + Cesium desktop app for previewing a ride in 3D and exporting a fly-over video.

## Start the app

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm start
```

## Run tests

The current test command is a smoke test that launches the Electron app:

```bash
npm test
```

You can also run the smoke test directly:

```bash
npm run smoke
```

## Available V1 features

- Cesium-based 3D route preview inside an Electron desktop shell
- Bundled sample TCX activity loading
- Playback controls: play, pause, restart
- Timeline slider with scrubbing
- Rich playback header with elapsed time, duration, activity time, distance, and progress
- Follow and overview camera modes
- MP4 export from the same app window
- Export settings for resolution, FPS, speed multiplier, and camera mode
- Export and import progress bars
- Media import for photos and videos
- EXIF / media timestamp extraction
- Automatic media alignment on the activity timeline
- Permanent media thumbnail/card markers placed on the route in preview
- Media insertion into exported video with a simple animation
- Scrollable control panel
- Route/marker altitude alignment fixes and follow-camera stability improvements
- Cached route-display geometry for better playback and export performance

## Notes

- The current app is still a v1-focused proof of concept.
- The main automated verification is the Electron smoke test.
- A number of later-version features are tracked in `requirement_v1_v2.md`.
