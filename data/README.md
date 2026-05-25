# IRS SOI State-to-State Migration Data

Downloaded 2026-05-25 from https://www.irs.gov/statistics/soi-tax-stats-migration-data

Covers filing years 2011–2012 through 2022–2023 (12 annual releases).

## On-disk layout

```
data/
├── docs/
│   └── 2223inpublicmigdoc.pdf      # IRS codebook (applies 2011–2023; schema stable)
└── raw/
    ├── 2011-2012/
    │   ├── stateinflow1112.csv     # State-pair inflows, totals only
    │   ├── stateoutflow1112.csv    # State-pair outflows, totals only
    │   └── 1112inmigall.csv        # Per-state AGI × age cross-tab
    ├── 2012-2013/
    │   └── …
    └── 2022-2023/
        ├── stateinflow2223.csv
        ├── stateoutflow2223.csv
        ├── 2223inmigall.csv
        ├── 2223inmigall.xlsx       # Excel mirror of inmigall.csv
        └── 2223migrationdata.zip   # IRS 404 — ignore; file is HTML, not a ZIP
```

## CRITICAL STRUCTURAL FINDING

Two different files, two different shapes. **There is no public IRS file
that gives state-pair flows broken down by AGI or age bracket.**

### File type 1 — State-to-state pair flows (`stateinflowYYYY.csv`, `stateoutflowYYYY.csv`)

- One row per (origin state, destination state).
- Columns: `y2_statefips`, `y1_statefips`, `y1_state`, `y1_state_name`, `n1` (returns), `n2` (individuals), `AGI`.
- **No bracket columns at all.** Pair-level data is published as totals only.
- ~2,850 rows per file (51 destinations × 56 origin codes incl. summaries).
- Suppression: `-1` for cells below 10 returns.

### File type 2 — Gross Migration File (`YYinmigall.csv`)

- One row per (state, AGI bracket). 408 rows per file (51 states × 8 AGI rows).
- 144 columns covering five flow categories × seven age columns × four measures:
  - **Flow categories**: `TOTAL_`, `NONMIG_` (non-migrants / stayers), `OUTFLOW_`, `INFLOW_`, `SAMEST_` (same-state county movers).
  - **Age columns** (suffix `_0` to `_6`): `_0` = all ages; `_1` = under 26; `_2` = 26 under 35; `_3` = 35 under 45; `_4` = 45 under 55; `_5` = 55 under 65; `_6` = 65 and over.
  - **Measures**: `N1` (returns), `N2` (individuals), `Y1_AGI` (year 1 AGI, $thousands), `Y2_AGI` (year 2 AGI, $thousands).
- `AGI_STUB` (row dimension): `0` = all classes; `1` = under $10K; `2` = $10–25K; `3` = $25–50K; `4` = $50–75K; `5` = $75–100K; `6` = $100–200K; `7` = $200K+.
- **Fully cross-tabbed AGI × age** — you CAN get "65+ AND $200K+" jointly here. This contradicts what's often assumed about the IRS data.
- **No destination detail** — only per-state aggregates.
- Suppression: cells <10 returns combined with another AGI class within the same age × state; survivors have N ≥ 10.
- Excludes negative-AGI returns (so state totals don't match the state-to-state files exactly — by design).

### What this means for visualization

You can ask any ONE of these questions cleanly, but not all three together:

1. *"Where did people leave CA for?"* → state-pair file, totals only.
2. *"What's the AGI × age mix of everyone who left CA?"* → Gross Migration file, full bracket cross-tab.
3. *"How many 65+ $200K+ filers moved from CA to FL specifically?"* → **NOT IN ANY PUBLIC IRS FILE.**

The honest design is two coordinated views that share a state selection
but explicitly do not join across the bracket dimension. Don't promise
a per-pair bracket filter — it's not supported by the source.

## Schema stability

Spot-checked — the Gross Migration File has 144 columns and identical
header structure across 2011–2012, 2015–2016, 2018–2019, and 2022–2023.
The 2022–2023 codebook (`docs/2223inpublicmigdoc.pdf`) should apply to
the full range.

## Methodological caveats worth surfacing in the UI

1. **Filer universe, not population.** Data covers Form 1040 filers only.
   Excludes non-filers (very low income, undocumented, some retirees).
   When you communicate rates, say "per 1,000 filers in bracket," not
   "per 1,000 residents."
2. **Address = mailing address.** Not necessarily residence on the date
   income was earned. Snowbirds and split-year movers add noise.
3. **2022–2023 release changed the matching method** — about a 5% increase
   in matched returns vs. prior methodology. Cross-year comparisons that
   span this release boundary should carry a footnote.
4. **County crosswalk drift.** The crosswalk is rebuilt annually; a
   small fraction of returns shift counties year-to-year for crosswalk
   reasons, not actual moves. Affects non-migrant counts more than
   migrant counts.
5. **State-to-state and Gross Migration totals will not match.** The
   Gross Migration file excludes negative-AGI returns; the pair files
   include them.

## Suppression handling

- Pair files: `-1` means "suppressed" — render as a distinct hatch, NOT zero.
- Gross Migration: small cells are merged into an adjacent AGI bracket
  within the same age × state, so you won't see explicit "-1" values
  in `inmigall.csv` — but you should still treat very small N1 values
  with skepticism and consider a minimum-sample threshold for rate
  calculations.

## Useful denominator pattern

For "out-migration rate" by bracket:

```
rate = OUTFLOW_N1_<age> / (OUTFLOW_N1_<age> + NONMIG_N1_<age>) * 1000
```

both pulled from the same row of `YYinmigall.csv` for the selected
state and AGI_STUB. Apples-to-apples; both are filers from the same
release.
