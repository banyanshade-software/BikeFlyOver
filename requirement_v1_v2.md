# BikeFlyOver feature matrix for v1 to v4

Version selection rule: use the **Version** column to assign each row to `v1`, `v2`, `v3`, or `v4`.

## Current implemented POC baseline

These capabilities already exist in the current proof of concept and should be treated as the starting point for planning:

- Electron desktop shell with Cesium-based 3D viewer
- Sample TCX loading from a bundled file
- Route rendering with start marker, end marker, current position marker, and played-route highlight
- Interactive playback controls: play, pause, restart
- Two camera modes: follow and overview
- Export MP4 action inside the same POC window
- Export settings for resolution, fps, timing mode, speed multiplier, and camera mode
- Export progress and cancellation feedback
- Deterministic frame-by-frame export pipeline with PNG capture and MP4 assembly
- Responsive two-column layout
- Scrollable control panel/sidebar (`summary-panel` already uses `overflow: auto`)

## Feature matrix

| ID | Version | Category | Feature | Why it matters | Current state |
| --- | --- | --- | --- | --- | --- |
| F-01 |v3  | Import | Import user-selected TCX files from file picker | Required by the spec for real user activity input | Not implemented |
| F-67 |v3  | Import | Import GPX files | implicit requirement | Not implemented |
| F-02 |v3  | Import | Import FIT files | FIT is explicitly required by the spec | Not implemented |
| F-03 |v3  | Import | Support drag-and-drop import for traces, photos, and videos | Required by the spec and improves workflow speed | Not implemented |
| F-04 |v3  | Import | Support menu-driven import commands | Required by the spec for discoverability and desktop UX | Not implemented |
| F-05 |v4  | Import | Join several TCX/FIT files into one project timeline | Required for multi-segment activities | Not implemented |
| F-06 |v3  | Import | Handle segment transitions with visible “fly jump” behavior | Explicitly requested in the spec | Not implemented |
| F-07 |v3  | Data model | Replace bundled sample-only loading with project-level imported asset management | Needed to move from POC to real product | Partial |
| F-08 |v1  | Timeline | Add a timeline slider for current track position | Explicitly requested in the GUI spec | Implemented |
| F-09 |v3  | Timeline | Allow scrubbing to any timestamp without restarting playback | Core editing and preview capability | Implemented |
| F-10 |v1  | Timeline | Show elapsed time, total duration, and current track position in a richer timeline header | Better navigation and editing context | Implemented |
| F-11 |v3  | Timeline | Add frame-accurate stepping controls for export review | Helps verify key camera and media moments | Not implemented |
| F-12 |v3  | Timeline | Add playback loop/range preview for selected sections | Useful for editing and export iteration | Not implemented |
| F-13 | v4 | Camera | Add first-person camera mode | Required by the spec | Not implemented |
| F-14 | v2 | Camera | Add editable camera altitude / distance / pitch / motion parameters | Required by the GUI spec | Implemented |
| F-15 |v3  | Camera | Add predefined camera moves at selected points (orbit, rotate around point, cinematic transition) | Required by the application overview | Not implemented |
| F-16 |v3  | Camera | Add keyframe-based camera authoring on the route timeline | Enables repeatable custom fly-over behavior | Not implemented |
| F-17 |v3  | Camera | Stabilize and refine follow-camera behavior for long tracks and sharp turns | Mentioned as a risk and improves export quality | Partial |
| F-69 | v2 | Terrain | Render the fly-over on optional real 3D terrain with configurable vertical exaggeration | Makes mountains and valleys visible while keeping the route visually attached to the ground when terrain is enabled | Implemented |
| F-18 |v1  | Media | Import photos and videos into the project | Required by the spec | Implemented |
| F-19 |v1  | Media | Read EXIF timestamps from photos and videos | Required for automatic placement | Implemented |
| F-20 |v1  | Media | Place photos/videos on the route timeline using timestamp alignment | Required by the spec | Implemented |
| F-21 |v2  | Media | Provide UI fields to fix camera/GPS time drift | Explicitly requested in the spec | Implemented |
| F-22 |v3  | Media | Preview inserted media in the timeline and viewer | Needed to validate placement before export | Not implemented |
| F-67 |v1  | Media | Show aligned media as permanent thumbnail/card markers placed on the track in the preview window | Gives immediate visual feedback that media placement is working before export | Implemented |
| F-68 |v1  | Media | Insert aligned media into the generated video with a simple animation | Turns imported photos/videos into visible output instead of metadata-only timeline items | Implemented |
| F-23 |v2  | Overlay | Display metrics from the activity file (speed, time, distance, heart rate when available) | Required by the spec | Implemented |
| F-24 |v2  | Overlay | Support text and graphical overlays (for example speedometer, stat chips, elevation, BPM) | Required by the spec | Implemented |
| F-25 |v2  | Overlay | Let users enable/disable each overlay independently | Needed for export customization | Implemented |
| F-26 |v3  | Overlay | Add overlay positioning and style presets | Needed to avoid one fixed layout | Not implemented |
| F-27 |v3  | Export | Expand export settings beyond current basics: output bitrate/quality profile | Improves control over file size and quality | Partial |
| F-28 |v2  | Export | Let users choose aspect preset explicitly as landscape / square / portrait | Required by the spec, partly covered today by resolution presets | Partial |
| F-29 |v2  | Export | Add export duration mode as alternative to speed multiplier | Mentioned in the render plan and useful for simpler UX | Not implemented |
| F-30 |v2  | Export | Add export summary dialog with output path, estimated frame count, and warnings | Improves usability and reduces accidental long exports | Not implemented |
| F-31 |v3  | Export | Preserve debug frame sequence on failure and expose it clearly in the UI | Useful for troubleshooting failed exports | Partial |
| F-32 |v3  | Export | Add resumable / restartable export workflow for failed long renders | Important for long projects | Not implemented |
| F-33 |v3  | Project | Save project locally with references to imported traces, media, timeline edits, camera setup, and export settings | Required by the spec | Not implemented |
| F-34 |v3  | Project | Load previously saved projects | Required by the spec | Not implemented |
| F-35 |v3  | Project | Detect missing files when reopening a project and offer relinking | Required for a usable desktop workflow | Not implemented |
| F-36 |v1  | GUI enhancement | Keep the control panel scrollable on all supported window sizes and long forms | Already partly present; should be preserved and hardened | Implemented |
| F-37 |v2  | GUI enhancement | Add a resizable split layout between control panel and viewer | Improves usability on large and small screens | Not implemented |
| F-38 |v2  | GUI enhancement | Add collapsible control sections (Import, Timeline, Camera, Overlay, Export) | Reduces clutter as features grow | Not implemented |
| F-39 |v2  | GUI enhancement | Add sticky playback/export status area while scrolling the control panel | Keeps critical controls visible | Not implemented |
| F-40 |v3  | GUI enhancement | Add a richer empty state and onboarding hints for first import | Improves usability for new users | Not implemented |
| F-41 |v3  | GUI enhancement | Improve responsive layout for narrow widths and portrait screens | Required by the spec | Partial |
| F-42 |v4  | GUI enhancement | Add keyboard shortcuts for playback, scrubbing, and export | Improves desktop ergonomics | Not implemented |
| F-43 |v3  | GUI enhancement | Add validation messages for invalid export settings and import errors | Improves robustness and clarity | Partial |
| F-44 |v1  | GUI enhancement | Add progress bars instead of text-only status for long-running exports/imports | Better feedback for long operations | Implemented |
| F-45 |v1  | Performance enhancement | Cache route-derived geometry and Cartesian positions to avoid repeated recomputation during playback/export | Improves viewer and export performance | Implemented |
| F-46 |v2  | Performance enhancement | Reduce unnecessary Cesium renders during interactive idle state | Improves CPU/GPU usage | Partial |
| F-47 |v2  | Performance enhancement | Profile and optimize export memory usage for large frame sequences | Important for long videos and high resolutions | Not implemented |
| F-48 |v4| Performance enhancement | Add temp-disk budgeting and warnings before large exports | Prevents failures for long or high-resolution renders | Not implemented |
| F-49 |v3 | Performance enhancement | Add optional imagery quality/performance profiles for preview vs export | Speeds up editing while preserving export quality | Not implemented |
| F-50 |v3 | Performance enhancement | Add background task progress throttling/log compaction for large exports | Keeps UI responsive during long jobs | Not implemented |
| F-51 |v3  | Performance enhancement | Optimize timeline scrubbing so camera and overlays update smoothly on large projects | Important once real media and multiple traces are added | Not implemented |
| F-52 |v2  | Reliability | Improve imagery/provider failure handling with clear retry and abort messaging | Mentioned in the export plan risks | Partial |
| F-53 |v2  | Reliability | Add import validation for malformed/empty TCX and FIT files | Needed for real-world usage | Partial |
| F-54 |v2  | Reliability | Add automated tests for import parsing, playback synchronization, export frame math, and project persistence | Required by the quality goals in the spec | Implemented |
| F-55 |v1  | Bug fix | Prevent the track line from visually floating too high above the ground or terrain | Fixes an obvious visual defect in route rendering | Implemented |
| F-56 |v1  | Bug fix | Ensure route markers and played-route highlight stay aligned with the same altitude/terrain strategy as the base track | Avoids mismatched route geometry during playback | Implemented |
| F-57 |v1  | Bug fix | Fix follow-camera drift, jitter, or overshoot on tight turns and steep elevation changes | Improves preview and export quality | Implemented |
| F-58 |v4  | Bug fix | Ensure export layout fully restores the normal POC layout after success, failure, or cancellation | Prevents UI state regressions after export | Partial |
| F-59 |v4  | Bug fix | Ensure export captures only the Cesium viewport and never includes hidden UI chrome or resize artifacts | Prevents bad MP4 output frames | Partial |
| F-60 |v2  | Bug fix | Handle window resize edge cases so low-resolution exports do not break the preview layout or controls | Important now that multiple export resolutions exist | Partial |
| F-61 |v4  | Bug fix | Prevent timeline/playback state from jumping unexpectedly after export ends | Keeps editing workflow predictable | Partial |
| F-62 |v3  | Platform | Define supported targets for desktop first, then mobile if still in scope | The current POC is desktop-focused while the spec mentions mobile | Not implemented |
| F-63 | v3 | Platform | Add packaging/distribution for macOS, Windows, and Linux | Required for actual desktop delivery | Not implemented |
| F-64 | v2 | Camera | Adapt speed: when track is idle, stay less (more time acceleration), specially if user paused | Makes better videos | Implemented |
| F-65 | v2 | Camera | Adapt camera movement: avoid too many moves ; when trace change direction, and specifically if it changes direction several time in a short time, get a higher point of view |  Makes better videos | Implemented |
| F-66 | v2 | Camera | Add a small map view as incrustation in the video ; north should stay up and map should show the whole track|  Makes better videos | Not Implemented |
| F-70 |v3  | Import | Import GPX files | implicit requirement | Not implemented |
| F-71 |v3  | Import | Loading of track and media can be done by drag and drop | new requirement | Not implemented |
| F-72 |v2  | Overlay | Overlay backgroud should be 50% transparent | new requirement | Implemented |
| F-73 |v2  | Overlay | graphical overlay (such as speed gauge) should have a size proportional to exported video size | new requirement | Not implemented |
| F-74 |v2  | Overlay | speed overlay as text in addition to graphical gauge (so that the user can chose) | new requirement | Not implemented |
| F-75 |v2  | Timeline | aibility to truncate timeline and export only part of it (for instance work and export all track except first hour and last x minutes) | new requirement | Implemented |


## Suggested grouping for release planning

### v1 candidates

- Timeline foundations: `F-08`, `F-10`
- Basic media alignment and presentation: `F-18`, `F-19`, `F-20`, `F-67`, `F-68`
- GUI essentials: `F-36`, `F-44`
- Immediate route and camera bug fixes: `F-45`, `F-55`, `F-56`, `F-57`

### v2 candidates

- Camera, terrain, and smarter video composition: `F-14`, `F-21`, `F-23`, `F-24`, `F-25`, `F-26`, `F-28`, `F-29`, `F-30`, `F-64`, `F-65`, `F-66`, `F-69`
- Timeline workflow improvements: `F-75`
- GUI workflow improvements: `F-37`, `F-38`, `F-39`
- Performance and robustness improvements for the export/editor loop: `F-46`, `F-47`, `F-52`, `F-53`, `F-54`, `F-60`

### v3 candidates

- Core import and project workflow: `F-01`, `F-02`, `F-03`, `F-04`, `F-06`, `F-07`, `F-33`, `F-34`, `F-35`
- Advanced editing and preview workflow: `F-09`, `F-11`, `F-12`, `F-13`, `F-15`, `F-16`, `F-17`, `F-22`
- Advanced export, validation, and UX work: `F-27`, `F-31`, `F-32`, `F-40`, `F-41`, `F-43`, `F-49`, `F-50`, `F-51`
- Platform planning and delivery: `F-62`, `F-63`

### v4 candidates

- Multi-trace composition: `F-05`
- Secondary desktop ergonomics and large-export safeguards: `F-42`, `F-48`
- Late-stage export restoration and playback-state cleanup: `F-58`, `F-59`, `F-61`

## Notes

- The current POC already covers a useful baseline for playback and MP4 export, so the next document versions should focus on turning the sample-driven prototype into a real project-based editor.
- GUI enhancements and performance enhancements are listed explicitly because they will become critical once imports, media, overlays, and project persistence are added.
- The scrollable control panel is already present in the POC, but it should remain an explicit requirement so future UI changes do not regress it.
- Known visual and workflow bugs are listed in the same matrix so they can be prioritized and assigned to `v1` or `v2` together with feature work.
