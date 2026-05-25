// Top control bar — sticky. Drives shared state for both sections.
const { useState, useMemo, useEffect, useRef, useCallback } = React;

function Segmented({ label, value, options, onChange, disabledOptions, hint }) {
  return (
    <div className="ctrl">
      <div className="ctrl-label">{label}{hint && <span className="hint" title={hint}>i</span>}</div>
      <div className="seg">
        {options.map(opt => {
          const v = typeof opt === "string" ? opt : opt.value;
          const lbl = typeof opt === "string" ? opt : opt.label;
          const tip = typeof opt === "object" ? opt.title : null;
          const disabled = disabledOptions?.includes(v);
          return (
            <button
              key={v}
              className={"seg-btn" + (value===v ? " on":"") + (disabled?" disabled":"")}
              onClick={() => !disabled && onChange(v)}
              title={tip || ""}
              disabled={disabled}
            >{lbl}</button>
          );
        })}
      </div>
    </div>
  );
}

function YearSlider({ year, onChange }) {
  const min = window.SOI.YEAR_MIN, max = window.SOI.YEAR_MAX;
  return (
    <div className="ctrl ctrl-year">
      <div className="ctrl-label">Tax year <span className="yr-val">{year}</span></div>
      <input
        type="range" min={min} max={max} step={1} value={year}
        onChange={e => onChange(+e.target.value)}
        title="AGI × age cross-tab data is only available from filing year 2011."
      />
      <div className="yr-ticks">
        <span>{min}</span><span>2015</span><span>2018</span><span>{max}</span>
      </div>
    </div>
  );
}

function StateSelector({ value, onChange }) {
  return (
    <div className="ctrl ctrl-state">
      <div className="ctrl-label">Selected state</div>
      <select value={value || ""} onChange={e=>onChange(e.target.value || null)}>
        <option value="">— pick a state —</option>
        {window.SOI.STATES.map(s => (
          <option key={s} value={s}>{window.SOI.STATE_NAMES[s]}</option>
        ))}
      </select>
    </div>
  );
}

function ControlBar(props) {
  const {
    year, setYear, direction, setDirection, measure, setMeasure,
    norm, setNorm, selectedState, setSelectedState,
  } = props;

  // Net forces Absolute (for pair view)
  useEffect(() => {
    if (direction === "net" && norm === "rate") setNorm("absolute");
  }, [direction]); // eslint-disable-line

  return (
    <div className="control-bar">
      <div className="cb-row cb-row-1">
        <YearSlider year={year} onChange={setYear} />
        <Segmented label="Direction" value={direction} onChange={setDirection}
          options={[
            {value:"inflow",  label:"Inflow"},
            {value:"outflow", label:"Outflow"},
            {value:"net",     label:"Net"},
          ]}
        />
        <Segmented label="Measure" value={measure} onChange={setMeasure}
          options={[
            {value:"returns",    label:"Returns"},
            {value:"exemptions", label:"People"},
            {value:"agi",        label:"AGI ($K)"},
          ]}
        />
        <Segmented
          label="Pair-view norm"
          value={norm} onChange={setNorm}
          options={[
            {value:"absolute", label:"Absolute"},
            {value:"rate",     label:"Rate / 1,000 stayers",
             title: direction==="net" ? "Rates are ill-defined for net flows." : "Denominator = total non-migrants for the origin (outflow) or destination (inflow) state — NONMIG_N1_0 in IRS terms."},
          ]}
          disabledOptions={direction==="net" ? ["rate"] : []}
          hint={direction==="net" ? "Rates are ill-defined for net flows." : "Pair flows are published as totals only — rate uses the All-AGI × All-ages non-migrants cell as the denominator."}
        />
        <StateSelector value={selectedState} onChange={setSelectedState} />
      </div>
    </div>
  );
}

window.ControlBar = ControlBar;
