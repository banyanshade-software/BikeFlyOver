# BikeFlyOver feature matrix for v1 / v2

Version selection rule: leave the **Version** column empty until product review is complete, then fill each row with `v1` or `v2`.

## Current implemented POC baseline

These capabilities already exist in the current proof of concept and should be treated as the starting point for planning:

- Electron desktop shell with Cesium-based 3D viewer
- Sample TCX loading from a bundled file
- Route rendering with start marker, end marker, current position marker, and played-route highlight
- Interactive playback controls: play, pause, restart
- Two camera modes: follow and overview
- Export MP4 action inside the same POC window
- Export settings for resolution, fps, speed multiplier, and camera mode
- Export progress and cancellation feedback
- Deterministic frame-by-frame export pipeline with PNG capture and MP4 assembly
- Responsive two-column layout
- Scrollable control panel/sidebar (`summary-panel` already uses `overflow: auto`)

## Feature matrix

| ID | Version | Category | Feature | Why it matters | Current state |
| --- | --- | --- | --- | --- | --- |
| F-01 |  | Import | Import user-selected TCX files from file picker | Required by the spec for real user activity input | Not implemented |
| F-02 |  | Import | Import FIT files | FIT is explicitly required by the spec | Not implemented |
| F-03 |  | Import | Support drag-and-drop import for traces, photos, and videos | Required by the spec and improves workflow speed | Not implemented |
| F-04 |  | Import | Support menu-driven import commands | Required by the spec for discoverability and desktop UX | Not implemented |
| F-05 |  | Import | Join several TCX/FIT files into one project timeline | Required for multi-segment activities | Not implemented |
| F-06 |  | Import | Handle segment transitions with visible “fly jump” behavior | Explicitly requested in the spec | Not implemented |
| F-07 |  | Data model | Replace bundled sample-only loading with project-level imported asset management | Needed to move from POC to real product | Partial |
| F-08 |  | Timeline | Add a timeline slider for current track position | Explicitly requested in the GUI spec | Not implemented |
| F-09 |  | Timeline | Allow scrubbing to any timestamp without restarting playback | Core editing and preview capability | Not implemented |
| F-10 |  | Timeline | Show elapsed time, total duration, and current track position in a richer timeline header | Better navigation and editing context | Partial |
| F-11 |  | Timeline | Add frame-accurate stepping controls for export review | Helps verify key camera and media moments | Not implemented |
| F-12 |  | Timeline | Add playback loop/range preview for selected sections | Useful for editing and export iteration | Not implemented |
| F-13 |  | Camera | Add first-person camera mode | Required by the spec | Not implemented |
| F-14 |  | Camera | Add editable camera altitude / distance / pitch / motion parameters | Required by the GUI spec | Not implemented |
| F-15 |  | Camera | Add predefined camera moves at selected points (orbit, rotate around point, cinematic transition) | Required by the application overview | Not implemented |
| F-16 |  | Camera | Add keyframe-based camera authoring on the route timeline | Enables repeatable custom fly-over behavior | Not implemented |
| F-17 |  | Camera | Stabilize and refine follow-camera behavior for long tracks and sharp turns | Mentioned as a risk and improves export quality | Partial |
| F-18 |  | Media | Import photos and videos into the project | Required by the spec | Not implemented |
| F-19 |  | Media | Read EXIF timestamps from photos and videos | Required for automatic placement | Not implemented |
| F-20 |  | Media | Place photos/videos on the route timeline using timestamp alignment | Required by the spec | Not implemented |
| F-21 |  | Media | Provide UI fields to fix camera/GPS time drift | Explicitly requested in the spec | Not implemented |
| F-22 |  | Media | Preview inserted media in the timeline and viewer | Needed to validate placement before export | Not implemented |
| F-23 |  | Overlay | Display metrics from the activity file (speed, time, distance, heart rate when available) | Required by the spec | Not implemented |
| F-24 |  | Overlay | Support text and graphical overlays (for example speedometer, stat chips, elevation, BPM) | Required by the spec | Not implemented |
| F-25 |  | Overlay | Let users enable/disable each overlay independently | Needed for export customization | Not implemented |
| F-26 |  | Overlay | Add overlay positioning and style presets | Needed to avoid one fixed layout | Not implemented |
| F-27 |  | Export | Expand export settings beyond current basics: output bitrate/quality profile | Improves control over file size and quality | Partial |
| F-28 |  | Export | Let users choose aspect preset explicitly as landscape / square / portrait | Required by the spec, partly covered today by resolution presets | Partial |
| F-29 |  | Export | Add export duration mode as alternative to speed multiplier | Mentioned in the render plan and useful for simpler UX | Not implemented |
| F-30 |  | Export | Add export summary dialog with output path, estimated frame count, and warnings | Improves usability and reduces accidental long exports | Not implemented |
| F-31 |  | Export | Preserve debug frame sequence on failure and expose it clearly in the UI | Useful for troubleshooting failed exports | Partial |
| F-32 |  | Export | Add resumable / restartable export workflow for failed long renders | Important for long projects | Not implemented |
| F-33 |  | Project | Save project locally with references to imported traces, media, timeline edits, camera setup, and export settings | Required by the spec | Not implemented |
| F-34 |  | Project | Load previously saved projects | Required by the spec | Not implemented |
| F-35 |  | Project | Detect missing files when reopening a project and offer relinking | Required for a usable desktop workflow | Not implemented |
| F-36 |  | GUI enhancement | Keep the control panel scrollable on all supported window sizes and long forms | Already partly present; should be preserved and hardened | Partial |
| F-37 |  | GUI enhancement | Add a resizable split layout between control panel and viewer | Improves usability on large and small screens | Not implemented |
| F-38 |  | GUI enhancement | Add collapsible control sections (Import, Timeline, Camera, Overlay, Export) | Reduces clutter as features grow | Not implemented |
| F-39 |  | GUI enhancement | Add sticky playback/export status area while scrolling the control panel | Keeps critical controls visible | Not implemented |
| F-40 |  | GUI enhancement | Add a richer empty state and onboarding hints for first import | Improves usability for new users | Not implemented |
| F-41 |  | GUI enhancement | Improve responsive layout for narrow widths and portrait screens | Required by the spec | Partial |
| F-42 |  | GUI enhancement | Add keyboard shortcuts for playback, scrubbing, and export | Improves desktop ergonomics | Not implemented |
| F-43 |  | GUI enhancement | Add validation messages for invalid export settings and import errors | Improves robustness and clarity | Partial |
| F-44 |  | GUI enhancement | Add progress bars instead of text-only status for long-running exports/imports | Better feedback for long operations | Not implemented |
| F-45 |  | Performance enhancement | Cache route-derived geometry and Cartesian positions to avoid repeated recomputation during playback/export | Improves viewer and export performance | Partial |
| F-46 |  | Performance enhancement | Reduce unnecessary Cesium renders during interactive idle state | Improves CPU/GPU usage | Partial |
| F-47 |  | Performance enhancement | Profile and optimize export memory usage for large frame sequences | Important for long videos and high resolutions | Not implemented |
| F-48 |  | Performance enhancement | Add temp-disk budgeting and warnings before large exports | Prevents failures for long or high-resolution renders | Not implemented |
| F-49 |  | Performance enhancement | Add optional imagery quality/performance profiles for preview vs export | Speeds up editing while preserving export quality | Not implemented |
| F-50 |  | Performance enhancement | Add background task progress throttling/log compaction for large exports | Keeps UI responsive during long jobs | Not implemented |
| F-51 |  | Performance enhancement | Optimize timeline scrubbing so camera and overlays update smoothly on large projects | Important once real media and multiple traces are added | Not implemented |
| F-52 |  | Reliability | Improve imagery/provider failure handling with clear retry and abort messaging | Mentioned in the export plan risks | Partial |
| F-53 |  | Reliability | Add import validation for malformed/empty TCX and FIT files | Needed for real-world usage | Partial |
| F-54 |  | Reliability | Add automated tests for import parsing, playback synchronization, export frame math, and project persistence | Required by the quality goals in the spec | Partial |
| F-55 |  | Bug fix | Prevent the track line from visually floating too high above the ground or terrain | Fixes an obvious visual defect in route rendering | Partial |
| F-56 |  | Bug fix | Ensure route markers and played-route highlight stay aligned with the same altitude/terrain strategy as the base track | Avoids mismatched route geometry during playback | Partial |
| F-57 |  | Bug fix | Fix follow-camera drift, jitter, or overshoot on tight turns and steep elevation changes | Improves preview and export quality | Partial |
| F-58 |  | Bug fix | Ensure export layout fully restores the normal POC layout after success, failure, or cancellation | Prevents UI state regressions after export | Partial |
| F-59 |  | Bug fix | Ensure export captures only the Cesium viewport and never includes hidden UI chrome or resize artifacts | Prevents bad MP4 output frames | Partial |
| F-60 |  | Bug fix | Handle window resize edge cases so low-resolution exports do not break the preview layout or controls | Important now that multiple export resolutions exist | Partial |
| F-61 |  | Bug fix | Prevent timeline/playback state from jumping unexpectedly after export ends | Keeps editing workflow predictable | Partial |
| F-62 |  | Platform | Define supported targets for desktop first, then mobile if still in scope | The current POC is desktop-focused while the spec mentions mobile | Not implemented |
| F-63 |  | Platform | Add packaging/distribution for macOS, Windows, and Linux | Required for actual desktop delivery | Not implemented |

## Suggested grouping for release planning

### Likely v1 candidates

- Real activity import
- Timeline scrubbing
- First-person and improved follow camera
- Basic media timestamp alignment
- Overlay basics
- Save/load project
- Stronger export UX and reliability

### Likely v2 candidates

- Advanced camera keyframing and cinematic moves
- Rich media editing workflow
- Resume/retry export workflow
- Larger-scale performance tuning for heavy projects
- Cross-platform packaging beyond initial desktop targets

## Notes

- The current POC already covers a useful baseline for playback and MP4 export, so the next document versions should focus on turning the sample-driven prototype into a real project-based editor.
- GUI enhancements and performance enhancements are listed explicitly because they will become critical once imports, media, overlays, and project persistence are added.
- The scrollable control panel is already present in the POC, but it should remain an explicit requirement so future UI changes do not regress it.
- Known visual and workflow bugs are listed in the same matrix so they can be prioritized and assigned to `v1` or `v2` together with feature work.
