# Data sources

All data comes from the
[IRS Statistics of Income (SOI) Migration Data](https://www.irs.gov/statistics/soi-tax-stats-migration-data)
release, downloaded 2026-05-25. Coverage: filing years 2011–2012 through
2022–2023 (12 annual releases). Earlier years exist but lack age stratification.

## Two files, two shapes, no join

The IRS publishes state-level migration in two file types per year. They
cannot be joined to give "bracket-by-pair" detail — that joint distribution
is not released, almost certainly because most cells would be too small to
pass disclosure suppression.

### File 1 — State-pair flows

Filenames: `stateinflowYYYY.csv`, `stateoutflowYYYY.csv` (e.g. `stateoutflow2223.csv`).

One row per (origin, destination). Columns:

| Column | Meaning |
|---|---|
| `y1_statefips` | origin state FIPS (year 1) |
| `y2_statefips` | destination state FIPS (year 2) |
| `y2_state`, `y2_state_name` (outflow) | destination postal + name |
| `y1_state`, `y1_state_name` (inflow) | origin postal + name |
| `n1` | returns (households) |
| `n2` | exemptions (≈ people) |
| `AGI` | total adjusted gross income, $ thousands |

**Totals only — no bracket columns at all.** Suppression: cells below 10
returns are flagged with `-1`. The converter passes `-1` through unchanged;
the UI renders them as hatched cells, not zero.

Special destination/origin codes worth knowing:

- `96` = Total Migration (US and Foreign)
- `97` = Total Migration — US
- `98` = Total Migration — Foreign
- `57` = Foreign

The converter filters these out so only real state-pair rows reach the UI.

### File 2 — Gross Migration file

Filename: `YYinmigall.csv` (e.g. `2223inmigall.csv`). 408 rows per year
(51 states × 8 AGI rows). 144 columns. Schema stable across all 12 years
(spot-checked 2011, 2015, 2018, 2022).

Row keys:

| Column | Meaning |
|---|---|
| `STATEFIPS`, `STATE`, `STATE_NAME` | state identifiers |
| `AGI_STUB` | 0 = All; 1 = `<$10K`; 2 = `$10–25K`; 3 = `$25–50K`; 4 = `$50–75K`; 5 = `$75–100K`; 6 = `$100–200K`; 7 = `$200K+` |

Then 140 measure columns following the pattern `<CATEGORY>_<MEASURE>_<AGE>`:

- **CATEGORY** (5 values): `TOTAL`, `NONMIG` (non-migrants), `OUTFLOW`, `INFLOW`, `SAMEST` (same-state county movers).
- **MEASURE** (4 values): `N1` (returns), `N2` (exemptions), `Y1_AGI` (year 1 AGI), `Y2_AGI` (year 2 AGI). All AGI in $ thousands.
- **AGE** (7 values, suffix `_0` to `_6`): `_0` = All; `_1` = `<26`; `_2` = `26–34`; `_3` = `35–44`; `_4` = `45–54`; `_5` = `55–64`; `_6` = `65+`.

The cross-tab is **fully joint** — `OUTFLOW_N1_6` at `AGI_STUB=7` gives
the count of 65+ AND $200K+ filers who left the state. The bigger
limitation is that this file has no destination dimension; it's per-state
aggregates only.

Suppression in this file works differently. Cells below 10 returns are
combined into adjacent AGI brackets within the same age × state, so you
won't see explicit `-1` values in the source. Treat very small `N1` cells
with skepticism anyway, and consider a minimum-sample threshold for rate
calculations.

The Gross Migration file also **excludes negative-AGI returns**, so its
state totals will not match the state-pair file totals by design.

## Methodology notes worth surfacing

1. **Filer universe, not population.** Form 1040 filers only. Excludes
   non-filers (very low income, undocumented, some retirees). When quoting
   rates, say "per 1,000 filers in bracket," not "per 1,000 residents."
2. **Address is the mailing address.** Not necessarily residence on the
   date income was earned. Snowbirds and split-year movers add noise.
3. **2022–2023 release changed the matching method** — about a 5% increase
   in matched returns vs. prior methodology. Cross-year comparisons that
   span this release boundary deserve a footnote.
4. **County crosswalk drift.** The ZIP-to-county crosswalk is rebuilt
   annually; a small fraction of returns shift counties year-to-year for
   crosswalk reasons, not actual moves. Affects non-migrant counts more
   than migrant counts.

## Denominator for rates

For an out-migration rate by bracket (cross-tab view):

```
rate = OUTFLOW_N1_<age> / (OUTFLOW_N1_<age> + NONMIG_N1_<age>) × 1000
```

Both numerator and denominator come from the same row of `YYinmigall.csv`
for the selected state and AGI_STUB. Apples-to-apples — both are filers
from the same IRS release, with the same bracket boundaries, same year,
same suppression rules.

For pair-view rates (matrix / Sankey), the denominator is the destination's
or origin's `NONMIG_N1_0` (all-AGI × all-ages cell), since no bracket detail
exists at the pair level.
