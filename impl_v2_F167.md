# impl_v2_F167 — GPX file import

## Goal

Parse GPX activity files (`.gpx`) and produce the same trackpoint data model that TCX parsing already produces, so a GPX activity can be used as the primary activity source everywhere TCX is used today.

## Background

### Current state

- The app loads a single hardcoded TCX activity via `loadSampleTrack()` in `src/shared/sample-track.js`.
- The only activity parser is `src/io/tcx/parseTcx.js`, which exposes `parseTcxTrack(xml)` and `summarizeTrackpoints(trackpoints)`.
- `summarizeTrackpoints` is format-agnostic (operates on the normalized trackpoint model); it can be reused as-is.
- A sample GPX file exists at `samples3/activity.gpx` (a BRouter route — no timestamps).

### Trackpoint model (shared across formats)

```js
{
  time: "2024-01-01T10:00:05.000Z",   // ISO string
  timestamp: 1704067205000,            // ms since epoch
  latitude: 46.1001,
  longitude: 6.2001,
  altitude: 410,                       // metres
  distance: null,                      // metres cumulative, or null
  heartRate: null,                     // bpm, or null
  speed: null,                         // m/s, or null
  cadence: null,                       // rpm, or null
  temperature: null,                   // °C, or null
}
```

### GPX format notes

GPX 1.1 activity recordings from Garmin/Wahoo/Strava look like:

```xml
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <trkseg>
      <trkpt lat="46.1001" lon="6.2001">
        <ele>410</ele>
        <time>2024-01-01T10:00:05Z</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>140</gpxtpx:hr>
            <gpxtpx:cad>80</gpxtpx:cad>
            <gpxtpx:speed>8.5</gpxtpx:speed>
            <gpxtpx:atemp>17</gpxtpx:atemp>
          </gpxtpx:TrackPointExtension>
        </extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>
```

Key differences from TCX:
- `lat` and `lon` are **XML attributes** of `<trkpt>`, not child elements.
- Altitude is `<ele>`, not `<AltitudeMeters>`.
- Metrics live in `<extensions>` with a namespace prefix (`gpxtpx:`, `ns3:`, etc.) that varies by device.
- Multiple `<trkseg>` within a `<trk>`, and multiple `<trk>` within the file — all segments must be flattened.
- No standard `<distancemeters>` field → `distance` is always `null`.
- Route GPX files (e.g. BRouter output) have no `<time>` elements; these cannot be used as activity input.

## Implementation

### 1. `src/io/gpx/parseGpx.js` (new file)

Use `fast-xml-parser` (already a dependency) with the same options as the TCX parser plus attribute parsing:

```js
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",   // so lat/lon come through as plain keys
  removeNSPrefix: true,      // strips gpxtpx:, ns3:, etc.
  parseTagValue: true,
  trimValues: true,
});
```

**`buildTrackpoint(rawTrkpt)`**

| GPX path | Trackpoint field |
|---|---|
| `rawTrkpt.lat` (attr) | `latitude` |
| `rawTrkpt.lon` (attr) | `longitude` |
| `rawTrkpt.ele` | `altitude` |
| `rawTrkpt.time` | `time` / `timestamp` |
| `rawTrkpt.extensions?.TrackPointExtension?.hr` | `heartRate` |
| `rawTrkpt.extensions?.TrackPointExtension?.cad` | `cadence` |
| `rawTrkpt.extensions?.TrackPointExtension?.speed` | `speed` |
| `rawTrkpt.extensions?.TrackPointExtension?.atemp` | `temperature` |
| _(none)_ | `distance: null` |

A point is discarded if any of `latitude`, `longitude`, `altitude`, or `timestamp` is non-finite.

**`parseGpxTrack(xml)`**

- Parse XML.
- Walk `gpx.trk` (array-normalised) → each `trkseg` (array-normalised) → each `trkpt` (array-normalised).
- Map to `buildTrackpoint`, filter nulls.
- Sort by `timestamp`.
- Remove duplicates (same as TCX: same timestamp+lat+lon+alt).
- Throw `"No valid trackpoints were parsed from the GPX file."` if result is empty.
- Throw `"No timestamped trackpoints found in the GPX file. Route files cannot be used as activity input."` if raw points exist but all had no `<time>`.

Re-export `summarizeTrackpoints` from `parseTcx.js` (the function is generic).

Exports: `{ parseGpxTrack, summarizeTrackpoints }`

### 2. `src/shared/sample-track.js` — add generic `loadActivityFile`

Add a function that dispatches to the correct parser by extension:

```js
async function loadActivityFile(filePath) {
  const xml = await fs.readFile(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  const trackpoints = ext === ".gpx" ? parseGpxTrack(xml) : parseTcxTrack(xml);
  const summary = summarizeTrackpoints(trackpoints);
  return { fileName: path.basename(filePath), filePath, trackpoints, summary };
}
```

`loadSampleTrack` becomes a thin wrapper: `return loadActivityFile(getSampleTrackPath())`.

Export `loadActivityFile`.

### 3. `test/parse-gpx.test.js` (new file)

Tests mirror the TCX test structure:

- **Parse with all fields** — activity GPX with `<time>`, `<ele>`, hr/cad/speed/atemp extensions → correct trackpoint values, correct sort order, duplicates removed.
- **Missing optional metrics** — GPX without extensions → `heartRate/cadence/speed/temperature` all `null`.
- **Multi-segment flattening** — two `<trkseg>` in one `<trk>` → points from both are merged and sorted.
- **Multi-track flattening** — two `<trk>` elements → points from both are merged and sorted.
- **No-timestamp route GPX** — only `lat/lon/ele`, no `<time>` → throws with the route-file message.
- **Empty / all-invalid points** — no valid lat/lon/alt → throws standard no-trackpoints message.
- **`summarizeTrackpoints` re-export** — the re-exported function returns the same structure as when imported from `parseTcx`.

## Files changed

| File | Change |
|---|---|
| `src/io/gpx/parseGpx.js` | **New** — GPX parser |
| `src/shared/sample-track.js` | Add `loadActivityFile`; `loadSampleTrack` delegates to it |
| `test/parse-gpx.test.js` | **New** — unit tests for GPX parser |

## Out of scope for F-167

- File picker UI for GPX (that belongs to F-01 / F-03).
- FIT format support (F-02).
- Route GPX without timestamps — these are rejected with a clear error; support can be added if needed later.
- Distance computation from lat/lon (GPX has no standard distance field; the overlay already handles `null` distance gracefully).
