# Architecture

Single-page React app, no build step. Babel runs in the browser, so the
`.jsx` files are loaded directly via `<script type="text/babel">`. The
data layer is a JSON payload embedded in a generated `.js` file. Everything
runs from `file://` or any static server.

## Components

| File | Responsibility |
|---|---|
| `SOI Migration Explorer.html` | Page shell, loads React + Babel from CDN, loads `data-real.js` then the `.jsx` files in dependency order. |
| `data-real.js` | Generated. Sets `window.SOI_DATA = { pair, crosstab }` from the IRS CSVs. ~7.7 MB. Built by `scripts/build_data.py`. |
| `data.jsx` | Defines the public `window.SOI` API (state list, year range, lookup functions). When `window.SOI_DATA` is present, reads from it; otherwise falls back to a synthetic fixture for design-time work. |
| `controls.jsx` | Top control bar — year slider, state selector, direction, measure, normalization toggles. |
| `matrix.jsx` | 51×51 origin × destination heatmap (Section 1, view A). |
| `sankey.jsx` | Top-N flows Sankey (Section 1, view B). |
| `crosstab.jsx` | 8×7 AGI × age heatmap for the selected state (Section 2). |
| `app.jsx` | Orchestrates the layout, shared state, and section labels. |
| `styles.css` | All visual styling. Dark theme, Inter + Lora typography. |

## Data flow

```
data/raw/<year>/{stateinflow,stateoutflow,inmigall}.csv
            │
            │  scripts/build_data.py
            ▼
mockup/data-real.js  ──[loaded as <script>]──▶  window.SOI_DATA
            │
            │  data.jsx loadReal()
            ▼
window.SOI.{pairValue, pairStayers, crosstabCell}
            │
            │  React components read via window.SOI
            ▼
matrix.jsx, sankey.jsx, crosstab.jsx
```

The `window.SOI` indirection means components do not care whether the
underlying data is the real IRS payload or the synthetic fixture. Swapping
in a different data source (e.g. per-year lazy loading) is a one-file change
inside `data.jsx`.

## Public `window.SOI` API

```js
window.SOI.STATES                 // array of 51 postal codes
window.SOI.STATE_NAMES            // { AL: "Alabama", ... }
window.SOI.AGI_BRACKETS           // 7 labels, "<$10K" ... "$200K+"
window.SOI.AGI_LABELS_FULL        // ["All AGI", ...AGI_BRACKETS]
window.SOI.AGE_BRACKETS           // 6 labels, "<26" ... "65+"
window.SOI.AGE_LABELS_FULL        // ["All ages", ...AGE_BRACKETS]
window.SOI.YEARS, YEAR_MIN, YEAR_MAX

// Pair view (totals only — no bracket dimension)
window.SOI.pairValue(year, origin, dest, measure)
// → number (returns/exemptions/AGI), -1 if IRS-suppressed, null if missing
window.SOI.pairStayers(year, state, measure)
// → state's total non-migrants in the chosen measure (denominator for rates)

// Cross-tab view (AGI × age, per state)
window.SOI.crosstabCell(year, state, category, agiIdx, ageIdx, measure)
// category ∈ {"total","nonmig","outflow","inflow","samest"}
// agiIdx 0..7 (0 = All AGI); ageIdx 0..6 (0 = All ages)
// measure ∈ {"returns","exemptions","agi"}
```

## Why a 7.7 MB JS file (not a fetch)

Two reasons:

1. **`file://` works.** Loading the HTML directly from the filesystem still
   shows the explorer. A `fetch()` of a JSON file would be blocked by CORS
   under `file://`. Embedding the data as a `<script>` sidesteps the issue.
2. **Single-load simplicity.** First-load cost is real (~1s on a fast
   connection), but every interaction after that is instant — no per-year
   loading hiccup when scrubbing the year slider.

If first-load cost becomes a problem, the natural optimization is per-year
files (`data-2022.js`, etc.) loaded lazily as the user scrubs the slider,
keeping `window.SOI_DATA` shape but populating it on demand.

## Why no build pipeline

Browser-side Babel is fine for a single-page exploratory tool. There's no
TypeScript, no bundler, no test framework. If this grows into a more serious
artifact, the natural next step is Vite — `data.jsx` becomes `data.ts` with
the same `window.SOI` interface, and `data-real.js` becomes either a dynamic
import or a fetch (which works under HTTP).
