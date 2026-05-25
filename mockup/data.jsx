// ============================================================================
// IRS SOI State-to-State Migration — Data Layer (REVISED)
// ----------------------------------------------------------------------------
// The IRS publishes migration data in TWO files that DO NOT JOIN:
//
//   (a) State-pair flows (stateinflow / stateoutflow CSVs)
//       One row per (origin, destination), TOTALS ONLY. No brackets.
//       Real schema (per row, per year):
//         y1_statefips: int (origin FIPS — prior year)
//         y2_statefips: int (destination FIPS — current year)
//         y1_state:     string (postal)
//         y2_state:     string (postal)
//         n1:           int   (returns)         — -1 if IRS-suppressed
//         n2:           int   (exemptions/people)
//         agi:          int   (total AGI in $thousands)
//
//   (b) Gross Migration file (YYinmigall.csv)
//       408 rows per year = 51 states × 8 AGI stubs (0=All, 1..7=brackets).
//       144 columns: 5 categories × (1 stub-tag + 7 age × 4 measures + few).
//       Categories: total, nonmig, outflow, inflow, samest.
//       Ages: 0=All, 1=<26, 2=26-34, 3=35-44, 4=45-54, 5=55-64, 6=65+.
//       Cross-tab is AGI × age JOINT — "65+ AND $200K+" is supported here,
//       but ONLY at the per-state aggregate level (no destination dim).
//
// CONSEQUENCE FOR THE UI:
//   - Pair view cannot be bracket-filtered.
//   - Bracket view cannot be destination-filtered.
//
// To swap in real CSV, replace `generateFixture()` with a loader returning
// the same { pair, crosstab } structure documented below. Cross-tab
// availability begins with filing year 2011.
// ============================================================================

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY"
];
const STATE_NAMES = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
  CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",
  FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",
  IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
  MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",
  MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",
  NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",
  ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",
  RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",
  TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",
  WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};
const STATE_WEIGHT = {
  CA:39.5,TX:29.5,FL:21.8,NY:19.5,PA:13.0,IL:12.7,OH:11.8,GA:10.7,NC:10.5,
  MI:10.0,NJ:9.3,VA:8.6,WA:7.7,AZ:7.3,MA:7.0,TN:6.9,IN:6.8,MD:6.2,MO:6.2,
  WI:5.9,CO:5.8,MN:5.7,SC:5.2,AL:5.0,LA:4.6,KY:4.5,OR:4.2,OK:4.0,CT:3.6,
  UT:3.3,IA:3.2,NV:3.1,AR:3.0,MS:2.9,KS:2.9,NM:2.1,NE:2.0,ID:1.9,WV:1.8,
  HI:1.4,NH:1.4,ME:1.4,MT:1.1,RI:1.1,DE:1.0,SD:0.9,ND:0.8,AK:0.7,DC:0.7,
  VT:0.6,WY:0.6
};

// agi_stub 0 = All; 1..7 are these brackets in order
const AGI_BRACKETS = ["<$10K","$10–25K","$25–50K","$50–75K","$75–100K","$100–200K","$200K+"];
const AGI_LABELS_FULL = ["All AGI", ...AGI_BRACKETS];
const AGI_DIST = [0.10, 0.17, 0.24, 0.16, 0.11, 0.16, 0.06];
const AGI_MID  = [5, 17, 37, 62, 87, 150, 400]; // mid-point in $K, for AGI computation

// age col 0 = All; 1..6
const AGE_BRACKETS = ["<26","26–34","35–44","45–54","55–64","65+"];
const AGE_LABELS_FULL = ["All ages", ...AGE_BRACKETS];
const AGE_DIST = [0.09, 0.20, 0.18, 0.18, 0.18, 0.17];
// Mobility multiplier by age
const AGE_MOBILITY = [1.35, 1.25, 1.05, 0.92, 0.78, 0.62];
// Mobility multiplier by AGI bracket — higher earners somewhat more mobile
const AGI_MOBILITY = [0.92, 0.96, 1.00, 1.04, 1.10, 1.18, 1.28];

const YEAR_MIN = 2011, YEAR_MAX = 2022;
const YEARS = Array.from({length: YEAR_MAX - YEAR_MIN + 1}, (_,i) => YEAR_MIN + i);

function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}
function rng(seed) { return hash(seed); }

const AFFINITY = {
  FL: ["NY","NJ","PA","CT","MA","IL","OH","MI","GA"],
  TX: ["CA","NY","IL","LA","OK","CO","FL","AZ"],
  AZ: ["CA","IL","WA","NV","CO","TX"],
  NC: ["NY","VA","FL","SC","NJ","PA","GA"],
  SC: ["NC","NY","NJ","GA","FL","VA"],
  TN: ["CA","FL","NY","IL","KY","GA"],
  NV: ["CA","AZ","WA","OR","UT"],
  ID: ["CA","WA","OR","UT","NV"],
  CA: ["TX","AZ","NV","WA","OR","ID","FL","CO"],
  NY: ["FL","NJ","CT","PA","NC","TX","CA"],
  IL: ["TX","FL","IN","WI","CA","AZ","MO"],
  NJ: ["FL","PA","NY","NC","TX"],
};
function affinityFactor(o, d, year) {
  let f = 1;
  if (AFFINITY[d]?.includes(o)) f *= 2.2;
  if (AFFINITY[o]?.includes(d)) f *= 1.8;
  if (year >= 2020) {
    if (["FL","TX","NC","SC","TN","AZ","ID","NV"].includes(d)) f *= 1.25;
    if (["CA","NY","IL","NJ"].includes(o)) f *= 1.20;
  }
  return f;
}

// ----------------------------------------------------------------------------
// Real data adapter. window.SOI_DATA is provided by data-real.js (auto-generated
// from the IRS CSVs by scripts/build_data.py) and is the shape:
//   pair[year][origin][dest] = {n1, n2, agi}
//   crosstab[year][state][category][agiStub][ageIdx] = {n1, n2, agi}
// where category ∈ {"total","nonmig","outflow","inflow","samest"},
// agiStub ∈ 0..7 (0=All), ageIdx ∈ 0..6 (0=All).
// Years and numeric indices arrive from JSON as strings; we tolerate either.
// ----------------------------------------------------------------------------
function loadReal() {
  if (!window.SOI_DATA) {
    console.error("SOI_DATA not loaded — did data-real.js fail to load?");
    return { pair: {}, crosstab: {} };
  }
  return window.SOI_DATA;
}

// ----------------------------------------------------------------------------
// Mock fixture generator. Retained as a fallback if SOI_DATA is missing.
// ----------------------------------------------------------------------------
function generateFixture() {
  // Final shapes:
  //   pair[year] = { [origin]: { [dest]: { n1, n2, agi } } } where any value
  //     may be -1 (= IRS suppressed). Diagonal omitted (same-state movers
  //     are reported in the crosstab "samest" category, not as pair rows).
  //   crosstab[year][state][category][agiStub][ageIdx] = { n1, n2, agi }
  //     category ∈ { total, nonmig, outflow, inflow, samest }
  //     agiStub 0..7  (0 = All AGI)
  //     ageIdx  0..6  (0 = All ages)
  //   stub 0 / age 0 are derived sums of stubs 1..7 / ages 1..6.

  const pair = {}, crosstab = {};

  for (const year of YEARS) {
    const ys = 1 + (year - 2011) * 0.012;
    pair[year] = {};
    crosstab[year] = {};

    // 1) Crosstab — generate per state, per (agiStub 1..7) × (age 1..6),
    //    for each of total/nonmig/outflow/inflow/samest. Then derive 0-stubs.
    for (const s of STATES) {
      const w = STATE_WEIGHT[s];
      const baseFilers = w * 380_000 * ys; // total returns approx
      const x = crosstab[year][s] = { total:{}, nonmig:{}, outflow:{}, inflow:{}, samest:{} };

      // Pre-compute cell counts for total per (agiStub, ageIdx)
      for (let ai=1; ai<=7; ai++) {
        for (const cat of ["total","nonmig","outflow","inflow","samest"]) {
          x[cat][ai] ??= {};
        }
        for (let ag=1; ag<=6; ag++) {
          const seed = `${year}-${s}-${ai}-${ag}`;
          // Base count of filers in this (AGI, age) cell
          const total_n1 = baseFilers * AGI_DIST[ai-1] * AGE_DIST[ag-1] *
                           (0.85 + rng(seed+"-t")*0.3);

          // Mobility share (~3-7% leave/year, mod by age and AGI)
          const mobility = 0.035 * AGE_MOBILITY[ag-1] * AGI_MOBILITY[ai-1] *
                           (0.85 + rng(seed+"-m")*0.3);
          const out_n1 = total_n1 * mobility;

          // Inflow varies independently — sunbelt magnets get a base bump
          const inflowMag = ["FL","TX","NC","SC","TN","AZ","ID","NV"].includes(s) ? 1.6
                          : ["CA","NY","IL","NJ"].includes(s) ? 0.7 : 1.0;
          const in_n1 = total_n1 * mobility * inflowMag * (0.85 + rng(seed+"-i")*0.3);

          // Same-state movers (intra-state migration ~5x interstate)
          const same_n1 = total_n1 * mobility * 4.5 * (0.9 + rng(seed+"-s")*0.2);

          // Non-migrants = total - outflow - samest (stayers in same return-filing state and address-stable)
          const nonmig_n1 = Math.max(0, total_n1 - out_n1 - same_n1);

          const make = (n1) => ({
            n1: Math.round(n1),
            n2: Math.round(n1 * 1.95),
            agi: Math.round(n1 * AGI_MID[ai-1]),
          });

          x.total[ai][ag]   = make(total_n1);
          x.nonmig[ai][ag]  = make(nonmig_n1);
          x.outflow[ai][ag] = make(out_n1);
          x.inflow[ai][ag]  = make(in_n1);
          x.samest[ai][ag]  = make(same_n1);

          // Random IRS suppression on the smallest cells in flow categories
          for (const cat of ["outflow","inflow"]) {
            if (x[cat][ai][ag].n1 < 20 && rng(seed+"-"+cat+"-sup") > 0.5) {
              x[cat][ai][ag] = { n1: -1, n2: -1, agi: -1 };
            }
          }
        }
      }

      // Derive stub 0 / age 0 marginals (skip -1 cells when summing)
      const sumCells = (cat, agiRange, ageRange) => {
        let n1=0, n2=0, agi=0;
        for (const ai of agiRange) for (const ag of ageRange) {
          const c = x[cat][ai][ag];
          if (c.n1 === -1) continue;
          n1 += c.n1; n2 += c.n2; agi += c.agi;
        }
        return { n1, n2, agi };
      };
      for (const cat of ["total","nonmig","outflow","inflow","samest"]) {
        x[cat][0] = {}; // agi=All
        for (let ag=0; ag<=6; ag++) {
          x[cat][0][ag] = sumCells(cat, [1,2,3,4,5,6,7], ag===0 ? [1,2,3,4,5,6] : [ag]);
        }
        for (let ai=1; ai<=7; ai++) {
          x[cat][ai][0] = sumCells(cat, [ai], [1,2,3,4,5,6]);
        }
      }
    }

    // 2) Pair flows — totals only, not bracket-decomposable.
    //    Anchor totals to the crosstab so they're internally consistent:
    //    Σ_d pair[o][d].n1 ≈ crosstab[o].outflow[0][0].n1 (within sampling noise).
    for (const o of STATES) {
      pair[year][o] = {};
      const outTotal = crosstab[year][o].outflow[0][0].n1;
      const wo = STATE_WEIGHT[o];

      // Compute raw weights for each destination
      const raw = {};
      let raw_sum = 0;
      for (const d of STATES) {
        if (d === o) continue;
        const wd = STATE_WEIGHT[d];
        const aff = affinityFactor(o, d, year);
        const w = Math.sqrt(wo * wd) * aff * (0.5 + rng(`${year}-${o}-${d}-w`)*1.0);
        raw[d] = w;
        raw_sum += w;
      }
      for (const d of STATES) {
        if (d === o) continue;
        let n1 = outTotal * (raw[d] / raw_sum);
        const sup = n1 < 20 && rng(`${year}-${o}-${d}-sup`) > 0.45;
        if (sup) {
          pair[year][o][d] = { n1: -1, n2: -1, agi: -1 };
        } else {
          n1 = Math.round(n1);
          pair[year][o][d] = {
            n1,
            n2: Math.round(n1 * 1.95),
            // Avg AGI per return ~ $60-90K depending on origin
            agi: Math.round(n1 * (55 + rng(`${year}-${o}-${d}-agi`)*40)),
          };
        }
      }
    }
  }

  return { pair, crosstab };
}

const FIXTURE = window.SOI_DATA ? loadReal() : generateFixture();

// ----------------------------------------------------------------------------
// Public API consumed by the UI.
// ----------------------------------------------------------------------------
const MEASURE_KEY = { returns: "n1", exemptions: "n2", agi: "agi" };

window.SOI = {
  STATES, STATE_NAMES,
  AGI_BRACKETS, AGI_LABELS_FULL,
  AGE_BRACKETS, AGE_LABELS_FULL,
  YEARS, YEAR_MIN, YEAR_MAX,
  MEASURE_KEY,

  // ---- PAIR API ----
  // Returns the raw flow value (or -1 if suppressed, null if diagonal/missing).
  pairValue(year, o, d, measure) {
    if (o === d) return null;
    const c = FIXTURE.pair[year]?.[o]?.[d];
    if (!c) return null;
    const v = c[MEASURE_KEY[measure]];
    return v;
  },
  // Total non-migrants for a state in the given measure — the denominator
  // for rate-per-1k calculations at the pair level (NONMIG_N1_0 in IRS terms,
  // i.e. the All-AGI × All-ages cell of the nonmig category).
  pairStayers(year, state, measure) {
    const c = FIXTURE.crosstab[year]?.[state]?.nonmig?.[0]?.[0];
    if (!c) return 0;
    return c[MEASURE_KEY[measure]];
  },

  // ---- CROSSTAB API ----
  // Cell value for selected state, agi_stub (0..7), age_idx (0..6), category
  // (one of total|nonmig|outflow|inflow|samest), measure. Returns -1 if
  // suppressed.
  crosstabCell(year, state, category, agiIdx, ageIdx, measure) {
    const c = FIXTURE.crosstab[year]?.[state]?.[category]?.[agiIdx]?.[ageIdx];
    if (!c) return null;
    const v = c[MEASURE_KEY[measure]];
    return v;
  },
};
