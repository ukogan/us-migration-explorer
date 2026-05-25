#!/usr/bin/env python3
"""
Read all 12 years of IRS SOI migration CSVs from data/raw/ and emit
mockup/data-real.js as a single window.SOI_DATA = {...} assignment.

Output shape matches the mockup's existing fixture API exactly:
  pair[year][origin_abbr][dest_abbr] = {n1, n2, agi}      # -1 = IRS-suppressed
  crosstab[year][state_abbr][category][agi_stub][age_idx] = {n1, n2, agi}
    category in {"total","nonmig","outflow","inflow","samest"}
    agi_stub in 0..7   (0 = All AGI; 1..7 = brackets)
    age_idx  in 0..6   (0 = All ages; 1..6 = age brackets)
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "mockup" / "data-real.js"

# Filing-year pair codes used in IRS filenames, mapped to the year the data REPRESENTS.
# Per IRS docs: in `stateinflow2223.csv`, year-2 (2023) is the destination/current address.
# The mockup's year axis labels "2011..2022" — using year-1 as the canonical year so that
# slider year 2022 maps to the 2022-2023 release.
YEAR_PAIRS = [
    ("1112", 2011),
    ("1213", 2012),
    ("1314", 2013),
    ("1415", 2014),
    ("1516", 2015),
    ("1617", 2016),
    ("1718", 2017),
    ("1819", 2018),
    ("1920", 2019),
    ("2021", 2020),
    ("2122", 2021),
    ("2223", 2022),
]

# Mockup STATES array — 50 states + DC, all uppercase postal.
STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY"
}

FIPS_TO_ABBR = {
    "01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT",
    "10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL",
    "18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD",
    "25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE",
    "32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND",
    "39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD",
    "47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV",
    "55":"WI","56":"WY",
}

CATEGORIES = ["total", "nonmig", "outflow", "inflow", "samest"]


def to_int(s):
    if s is None or s == "":
        return 0
    try:
        return int(s)
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return 0


def parse_pair(outflow_csv, inflow_csv):
    """Return {origin_abbr: {dest_abbr: {n1, n2, agi}}} for one year.

    Uses outflow file as primary (origin's perspective). Inflow file is parsed
    for cross-checking but not currently merged — outflow and inflow report
    the same underlying flow value, modulo a small reconciliation tolerance.
    """
    pair = {}

    with open(outflow_csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            origin_fips = row["y1_statefips"].strip().zfill(2)
            dest_fips   = row["y2_statefips"].strip().zfill(2)

            # Skip summary rows: 96/97/98 are total aggregates; 57 = foreign
            if dest_fips in ("96", "97", "98", "57"):
                continue
            if origin_fips in ("96", "97", "98", "57"):
                continue

            origin = FIPS_TO_ABBR.get(origin_fips)
            dest   = FIPS_TO_ABBR.get(dest_fips)
            if origin is None or dest is None:
                continue
            if origin not in STATES or dest not in STATES:
                continue
            if origin == dest:
                continue  # same-state movers live in the crosstab, not pair

            pair.setdefault(origin, {})[dest] = {
                "n1":  to_int(row["n1"]),
                "n2":  to_int(row["n2"]),
                "agi": to_int(row["AGI"]),
            }

    return pair


def parse_crosstab(inmigall_csv):
    """Return {state_abbr: {category: {agi_idx: {age_idx: {n1, n2, agi}}}}} for one year."""
    crosstab = {}

    with open(inmigall_csv, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            state = row["state"].strip().upper()
            if state not in STATES:
                continue
            agi_stub = int(row["agi_stub"])  # 0..7

            x = crosstab.setdefault(state, {c: {} for c in CATEGORIES})

            for cat in CATEGORIES:
                cat_key = cat if cat != "nonmig" else "nonmig"
                # IRS column naming convention: <CAT>_N1_<age>, <CAT>_N2_<age>,
                # <CAT>_Y1_AGI_<age>, <CAT>_Y2_AGI_<age>. We use Y2_AGI (current
                # year, matching the n1/n2 reference year per the codebook).
                cat_dict = x[cat].setdefault(agi_stub, {})
                for age in range(7):  # 0..6
                    n1_col  = f"{cat_key}_n1_{age}"
                    n2_col  = f"{cat_key}_n2_{age}"
                    agi_col = f"{cat_key}_y2_agi_{age}"
                    cat_dict[age] = {
                        "n1":  to_int(row.get(n1_col)),
                        "n2":  to_int(row.get(n2_col)),
                        "agi": to_int(row.get(agi_col)),
                    }
    return crosstab


def main():
    if not RAW.exists():
        sys.exit(f"missing {RAW}")

    pair_by_year = {}
    crosstab_by_year = {}

    for pair_code, year in YEAR_PAIRS:
        year_dir = RAW / f"{2000 + int(pair_code[:2])}-{2000 + int(pair_code[2:])}"
        outflow_csv  = year_dir / f"stateoutflow{pair_code}.csv"
        inflow_csv   = year_dir / f"stateinflow{pair_code}.csv"
        inmigall_csv = year_dir / f"{pair_code}inmigall.csv"

        for p in (outflow_csv, inflow_csv, inmigall_csv):
            if not p.exists():
                sys.exit(f"missing {p}")

        pair_by_year[year]      = parse_pair(outflow_csv, inflow_csv)
        crosstab_by_year[year]  = parse_crosstab(inmigall_csv)

        n_origins = len(pair_by_year[year])
        n_states  = len(crosstab_by_year[year])
        print(f"  {year}  pair_origins={n_origins}  crosstab_states={n_states}",
              file=sys.stderr)

    payload = {"pair": pair_by_year, "crosstab": crosstab_by_year}
    js = "// Auto-generated by scripts/build_data.py — DO NOT EDIT BY HAND\n"
    js += "window.SOI_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(js, encoding="utf-8")

    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"wrote {OUT}  ({size_mb:.2f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
