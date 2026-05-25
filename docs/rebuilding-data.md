# Rebuilding the data

The data is rebuilt by running one Python script — no dependencies beyond
the standard library.

```bash
cd us-migration-explorer
python3 scripts/build_data.py
```

This reads every CSV under `data/raw/` and rewrites `mockup/data-real.js`.
Takes a few seconds.

## When the IRS publishes a new year

The IRS typically releases a new filing year roughly 15 months after the
end of year 2 (e.g. the 2022–2023 release came out in late 2024).

1. **Find the year on the IRS page.**
   <https://www.irs.gov/statistics/soi-tax-stats-migration-data>
   Click into the new year's subpage to confirm the file URLs follow the
   `YYYY` two-digit-pair pattern (e.g. `2324` for 2023–2024).

2. **Download the three files into `data/raw/<year>/`.**

   ```bash
   YEAR=2023-2024
   CODE=2324
   mkdir -p data/raw/$YEAR
   cd data/raw/$YEAR
   curl -sSL -O https://www.irs.gov/pub/irs-soi/stateinflow${CODE}.csv
   curl -sSL -O https://www.irs.gov/pub/irs-soi/stateoutflow${CODE}.csv
   curl -sSL -O https://www.irs.gov/pub/irs-soi/${CODE}inmigall.csv
   ```

3. **Add the year to `scripts/build_data.py`.** Append a row to the
   `YEAR_PAIRS` list:

   ```python
   YEAR_PAIRS = [
       ...,
       ("2223", 2022),
       ("2324", 2023),   # new
   ]
   ```

   The canonical year used in the UI is year-1 (origin year). So `2324`
   maps to slider year `2023`.

4. **Regenerate.**

   ```bash
   python3 scripts/build_data.py
   ```

5. **Bump `YEAR_MAX` in `mockup/data.jsx`** so the slider extends to the new year:

   ```js
   const YEAR_MIN = 2011, YEAR_MAX = 2023;   // was 2022
   ```

6. **Sanity-check in the browser.** Start the server, scrub to the new year,
   confirm a known flow (e.g. CA → TX) looks plausible.

## When an IRS schema change might bite

The codebook bundled in `data/docs/2223inpublicmigdoc.pdf` is from the
2022–2023 release. Schema for the Gross Migration file has been stable
(144 columns) across all 12 years checked. If the IRS adds a column
between releases, the converter will silently pick it up only if the new
column matches one of the patterns it reads (`<category>_<measure>_<age>`);
otherwise the new data simply won't surface in the UI.

Worth re-reading the new year's codebook on each refresh — it's only
~30 pages and the "Nature of Changes" section flags methodology shifts.

## Validating a refresh

After regenerating, compare a known flow against published reporting to
catch import bugs:

```bash
python3 -c "
import json, re
js = open('mockup/data-real.js').read()
data = json.loads(re.search(r'= ({.*});', js, re.S).group(1))
year = '2022'  # or whatever you just added
print('CA->TX returns:', data['pair'][year]['CA']['TX']['n1'])
print('NY->FL returns:', data['pair'][year]['NY']['FL']['n1'])
print('CA stayers:    ', data['crosstab'][year]['CA']['nonmig']['0']['0']['n1'])
"
```

For 2022 these should be ~44k, ~43k, and ~15.1M respectively.
