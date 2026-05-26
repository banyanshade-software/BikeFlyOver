# impl_v3_F02 — FIT file import

## Goal

Add support for importing binary `.fit` activity files (Garmin FIT format) alongside the existing
`.tcx` and `.gpx` parsers, so users can import activities recorded on Garmin and other ANT+/FIT
devices (F-02).

## Background

### Prior state

- `src/shared/sample-track.js` already had `loadActivityFile(filePath)` dispatching to
  `parseTcxTrack` and `parseGpxTrack` by extension.
- The import dialog in `src/main/main.js` accepted only `.tcx` and `.gpx` files.
- No FIT parser existed in the project; `fit-file-parser` was not in `package.json`.

### Relevant files

| File | Role |
|---|---|
| `src/io/fit/parseFit.js` | New FIT binary parser (created for F-02) |
| `src/shared/sample-track.js` | `loadActivityFile` — extended to handle `.fit` |
| `src/main/main.js` | Import dialog file filter — extended to include `.fit` |
| `test/parse-fit.test.js` | Unit tests for the FIT parser (6 tests) |
| `package.json` | Added `fit-file-parser` dependency |

## Implementation

### FIT parser (`src/io/fit/parseFit.js`)

A new parser was created that:

1. Wraps `fit-file-parser` (CJS dist) to decode the binary FIT message stream.
2. Maps each `record` message to the shared trackpoint model (`time`, `timestamp`, `latitude`,
   `longitude`, `altitude`, `distance`, `heartRate`, `speed`, `cadence`, `temperature`).
3. Sorts the resulting array by timestamp (FIT files from multi-device recordings can be
   out-of-order).
4. Deduplicates consecutive trackpoints with identical `timestamp + lat + lon + altitude`.
5. Throws a descriptive error if the file produces no valid trackpoints.

### `loadActivityFile` extension (`src/shared/sample-track.js`)

The `.fit` branch reads the file as a binary `Buffer` (no encoding) and passes it to
`parseFitTrack`. TCX and GPX are still read as UTF-8 text.

### Import dialog (`src/main/main.js`)

The `activity-import` IPC handler's `filters` array was extended to include:
- `"Activity files"` — `["tcx", "gpx", "fit"]` (combined filter)
- `"FIT"` — `["fit"]` (dedicated filter)

## Key implementation notes

### `fit-file-parser` CJS quirk

The package ships as an ES module; the CJS build wraps the class under `.default`:

```js
const { default: FitParser } = require("fit-file-parser");
```

### Parser options

```js
new FitParser({
  force: true,           // skip CRC validation (real-world files often fail CRC)
  speedUnit: "m/s",
  lengthUnit: "m",
  temperatureUnit: "celsius",
  elapsedRecordField: false,
  mode: "list",          // flat data.records array (not grouped by message type)
})
```

### `timestamp` is a JS `Date`

`fit-file-parser` returns `record.timestamp` as a `Date` object. The parser converts it with
`.getTime()` to obtain milliseconds (matching the TCX/GPX convention).

### `force: true` is required

Many FIT files produced by real devices have incorrect CRC checksums. Without `force: true` the
parser throws on those files.

### Invalid sentinel values

FIT uses fixed-width integer sentinels for missing values (e.g. `0xFF` for UINT8,
`0xFFFF` for UINT16). `fit-file-parser` propagates these as their numeric values rather than
`null`. The `toFiniteOrNull` helper detects NaN/Infinity but **not** FIT sentinels — a future
improvement could map known sentinel values to `null` for optional fields.

## Tests (`test/parse-fit.test.js`)

Six unit tests exercise the parser against a hand-built binary FIT fixture:

| Test | What it checks |
|---|---|
| `parses all fields correctly` | All 9 fields decoded and within ±0.0001° |
| `returns null for missing optional fields` | Sentinel-valued fields map to `null` |
| `sorts out-of-order records by timestamp` | Chronological ordering guaranteed |
| `removes exact duplicate records` | Deduplication works |
| `throws for no valid records` | Empty-data file raises a descriptive error |
| `throws for a corrupt buffer` | Garbage input raises an error |

Run with:

```
npm run test:unit
```

## Feature tags

All changed code is surrounded by `// F-02: <why>` / `// end F-02` comments as per the project
convention.
