// Section 2 — AGI × age cross-tab heatmap for the selected state.
// 8 rows (agi_stub 0..7) × 7 cols (age 0..6).
// Data comes from the gross migration file's outflow/inflow categories.
const { useState: ctUseState, useMemo: ctUseMemo, useEffect: ctUseEffect } = React;

const RATE_DENOM_MIN = 500; // cells with nonmig below this are suppressed in Rate view

function CrosstabHeatmap(props) {
  const { year, direction, measure, selectedState } = props;
  const [norm, setNorm] = ctUseState("absolute"); // absolute | rate
  const [hover, setHover] = ctUseState(null);

  // Net forces Absolute
  ctUseEffect(() => {
    if (direction === "net" && norm === "rate") setNorm("absolute");
  }, [direction]); // eslint-disable-line

  if (!selectedState) {
    return (
      <div className="crosstab-wrap empty">
        <div className="crosstab-empty">
          <h2>Who moved · AGI × age</h2>
          <p>Pick a state above (or click any row/column header in the matrix) to see its bracket-level migration profile.</p>
        </div>
      </div>
    );
  }

  // Build matrix data
  // Categories: outflow uses "outflow", inflow uses "inflow",
  // Net = inflow_cell - outflow_cell.
  const data = ctUseMemo(() => {
    const AGI_ROWS = 8, AGE_COLS = 7;
    const rows = [];
    let minV = Infinity, maxV = -Infinity, maxAbsNet = 0;

    for (let ai=0; ai<AGI_ROWS; ai++) {
      const row = [];
      for (let ag=0; ag<AGE_COLS; ag++) {
        const cellOut = window.SOI.crosstabCell(year, selectedState, "outflow", ai, ag, measure);
        const cellIn  = window.SOI.crosstabCell(year, selectedState, "inflow",  ai, ag, measure);
        const cellNon = window.SOI.crosstabCell(year, selectedState, "nonmig",  ai, ag, measure);

        let flow, sup = null;
        if (direction === "outflow") {
          if (cellOut === -1 || cellOut == null) { row.push({sup:"irs"}); continue; }
          flow = cellOut;
        } else if (direction === "inflow") {
          if (cellIn === -1 || cellIn == null) { row.push({sup:"irs"}); continue; }
          flow = cellIn;
        } else { // net
          const a = (cellIn  === -1 || cellIn  == null) ? 0 : cellIn;
          const b = (cellOut === -1 || cellOut == null) ? 0 : cellOut;
          if (cellIn === -1 && cellOut === -1) { row.push({sup:"irs"}); continue; }
          flow = a - b; // positive = state gains
        }

        let v = flow;
        const denom = cellNon ?? 0;
        if (norm === "rate" && direction !== "net") {
          if (denom < RATE_DENOM_MIN) { row.push({sup:"thresh", flow, denom}); continue; }
          v = flow / (flow + denom) * 1000;
        }
        if (direction === "net") {
          if (Math.abs(v) > maxAbsNet) maxAbsNet = Math.abs(v);
        } else {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        row.push({ v, flow, denom });
      }
      rows.push(row);
    }
    if (direction !== "net" && !isFinite(minV)) { minV = 0; maxV = 1; }

    // Marginal distributions (use absolute flow, agi_stub 1..7 / age 1..6 only)
    const agiMarg = []; // for ai 1..7, sum across ag 1..6
    for (let ai=1; ai<=7; ai++) {
      let s = 0;
      for (let ag=1; ag<=6; ag++) {
        const r = rows[ai][ag];
        if (!r || r.sup) continue;
        s += Math.abs(r.flow ?? 0);
      }
      agiMarg.push(s);
    }
    const ageMarg = [];
    for (let ag=1; ag<=6; ag++) {
      let s = 0;
      for (let ai=1; ai<=7; ai++) {
        const r = rows[ai][ag];
        if (!r || r.sup) continue;
        s += Math.abs(r.flow ?? 0);
      }
      ageMarg.push(s);
    }
    return { rows, minV, maxV, maxAbsNet, agiMarg, ageMarg };
  }, [year, direction, measure, selectedState, norm]);

  const { rows, minV, maxV, maxAbsNet, agiMarg, ageMarg } = data;

  const colorOf = (v) => {
    if (direction === "net") {
      const t = maxAbsNet === 0 ? 0 : v / maxAbsNet;
      return window.rgbStr(window.divColor(Math.max(-1, Math.min(1, t))));
    }
    const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
    return window.rgbStr(window.seqColor(Math.sqrt(Math.max(0, t))));
  };

  // Layout
  const CELL_W = 78, CELL_H = 38;
  const AGI_LBL = 100, AGE_LBL = 70;
  const W = AGI_LBL + 7 * CELL_W;
  const H = AGE_LBL + 8 * CELL_H;

  const fmt = norm === "rate" && direction!=="net"
    ? window.fmtRate
    : (v) => window.fmtVal(v, measure);

  // Build tooltip content
  let tip = null;
  if (hover) {
    const { ai, ag, x, y } = hover;
    const cell = rows[ai][ag];
    const agiLbl = window.SOI.AGI_LABELS_FULL[ai];
    const ageLbl = window.SOI.AGE_LABELS_FULL[ag];
    let body;
    if (cell.sup === "irs") {
      body = <div className="tip-note">Suppressed by IRS</div>;
    } else if (cell.sup === "thresh") {
      body = (
        <>
          <div className="tip-note">Denominator below {RATE_DENOM_MIN}</div>
          <div className="tip-sub">Non-migrants in this cell: {window.fmtVal(cell.denom, measure)}</div>
        </>
      );
    } else {
      const rate = (cell.denom > 0 && direction !== "net")
        ? (cell.flow / (cell.flow + cell.denom)) * 1000
        : null;
      body = (
        <>
          <div className="tip-num">
            {direction === "net"
              ? window.fmtVal(cell.v, measure)
              : (norm === "rate" ? window.fmtRate(cell.v) : window.fmtVal(cell.v, measure))}
            <span className="tip-meas">
              {norm === "rate" && direction !== "net"
                ? " per 1,000 non-migrants"
                : " " + window.MEASURE_LABEL[measure]}
            </span>
          </div>
          {direction !== "net" && (
            <div className="tip-sub">
              Absolute flow: {window.fmtVal(cell.flow, measure)} ·
              Non-migrants: {window.fmtVal(cell.denom, measure)}
              {rate != null && <> · Rate: {rate.toFixed(2)} / 1k</>}
            </div>
          )}
          {direction === "net" && (
            <div className="tip-sub">
              {cell.v > 0 ? `Net gain for ${selectedState}` : cell.v < 0 ? `Net loss for ${selectedState}` : "Balanced"}
            </div>
          )}
        </>
      );
    }
    tip = (
      <div className="tip" style={{left: Math.min(x+14, W-260), top: Math.min(y+14, H-100)}}>
        <div className="tip-pair">
          <span className="tip-state">{agiLbl} · {ageLbl}</span>
        </div>
        {body}
      </div>
    );
  }

  // Marginals — find max for scale
  const agiMargMax = Math.max(1, ...agiMarg);
  const ageMargMax = Math.max(1, ...ageMarg);
  const BAR_W = 160;

  // Direction label
  const dirLabel = direction === "outflow" ? "Outflow from"
                 : direction === "inflow"  ? "Inflow into"
                 : "Net (Inflow − Outflow) for";

  const legend = (() => {
    if (direction === "net") return { kind:"div", min:-maxAbsNet, max:maxAbsNet };
    return { kind:"seq", min:minV, max:maxV };
  })();

  return (
    <div className="crosstab-wrap">
      <div className="crosstab-header">
        <div className="crosstab-title">
          <h2>Who moved · AGI × age</h2>
          <div className="crosstab-sub">
            {dirLabel} <strong>{window.SOI.STATE_NAMES[selectedState]}</strong> ({selectedState}) in {year}
            {norm === "rate" && direction !== "net" ? " · rate per 1,000 non-migrants (per-cell)" : ""}
          </div>
        </div>
        <div className="crosstab-controls">
          <div className="ctrl">
            <div className="ctrl-label">Norm</div>
            <div className="seg seg-small">
              <button className={"seg-btn"+(norm==="absolute"?" on":"")} onClick={()=>setNorm("absolute")}>Absolute</button>
              <button className={"seg-btn"+(norm==="rate"?" on":"")+(direction==="net"?" disabled":"")}
                      disabled={direction==="net"}
                      title={direction==="net"?"Rates are ill-defined for net flows.":""}
                      onClick={()=>direction!=="net" && setNorm("rate")}>Rate / 1k</button>
            </div>
          </div>
          <CrosstabLegend legend={legend} measure={measure} norm={norm} direction={direction} />
        </div>
      </div>

      <div className="crosstab-body">
        <div className="crosstab-grid" style={{width: W, height: H, position:"relative"}}>
          {/* Age column headers */}
          {window.SOI.AGE_LABELS_FULL.map((lbl, ag) => (
            <div key={"a"+ag}
                 className={"ct-col-label" + (ag===0 ? " all":"")}
                 style={{left: AGI_LBL + ag*CELL_W, top: 0, width: CELL_W, height: AGE_LBL}}>
              <div>{lbl}</div>
            </div>
          ))}
          {/* AGI row labels */}
          {window.SOI.AGI_LABELS_FULL.map((lbl, ai) => (
            <div key={"i"+ai}
                 className={"ct-row-label" + (ai===0 ? " all":"")}
                 style={{left: 0, top: AGE_LBL + ai*CELL_H, width: AGI_LBL, height: CELL_H}}>
              <div>{lbl}</div>
            </div>
          ))}
          {/* Cells */}
          {rows.map((row, ai) => row.map((cell, ag) => {
            const x = AGI_LBL + ag*CELL_W;
            const y = AGE_LBL + ai*CELL_H;
            let bg = "#f6f2ea";
            let isSup = false;
            let textColor = "#1a1a1a";
            if (cell.sup) {
              isSup = true;
            } else {
              bg = colorOf(cell.v);
              // Estimate luminance for text contrast
              const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(bg);
              if (m) {
                const lum = 0.299*+m[1] + 0.587*+m[2] + 0.114*+m[3];
                textColor = lum < 130 ? "#fbf8f2" : "#1a1a1a";
              }
            }
            const isMarginal = ai === 0 || ag === 0;
            return (
              <div
                key={`c${ai}-${ag}`}
                className={"ct-cell" + (isMarginal ? " marg":"") + (isSup ? " sup":"")}
                style={{
                  left:x, top:y, width:CELL_W, height:CELL_H,
                  background: isSup ? undefined : bg,
                  color: textColor,
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.parentElement.getBoundingClientRect();
                  setHover({ ai, ag, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.parentElement.getBoundingClientRect();
                  setHover({ ai, ag, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
              >
                {!isSup && (
                  <span className="ct-val">{fmt(cell.v)}</span>
                )}
              </div>
            );
          }))}
          {tip}
        </div>

        {/* Marginal bar charts */}
        <div className="crosstab-marginals">
          <div className="marg-block">
            <div className="marg-title">AGI distribution</div>
            <div className="marg-sub">Sum across all ages</div>
            <div className="marg-bars">
              {window.SOI.AGI_BRACKETS.map((b, k) => {
                const v = agiMarg[k];
                const pct = (v / agiMargMax) * 100;
                return (
                  <div key={b} className="marg-row">
                    <div className="marg-lbl">{b}</div>
                    <div className="marg-track">
                      <div className="marg-fill" style={{width: pct+"%"}} />
                    </div>
                    <div className="marg-val">{window.fmtVal(v, measure)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="marg-block">
            <div className="marg-title">Age distribution</div>
            <div className="marg-sub">Sum across all AGI</div>
            <div className="marg-bars">
              {window.SOI.AGE_BRACKETS.map((b, k) => {
                const v = ageMarg[k];
                const pct = (v / ageMargMax) * 100;
                return (
                  <div key={b} className="marg-row">
                    <div className="marg-lbl">{b}</div>
                    <div className="marg-track">
                      <div className="marg-fill alt" style={{width: pct+"%"}} />
                    </div>
                    <div className="marg-val">{window.fmtVal(v, measure)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="crosstab-caption">
        Cross-tab data is per-state aggregate (no destination dimension). Rate denominator = matched
        non-migrants cell (same AGI × age) for the same state. Cells with denominator below {RATE_DENOM_MIN} are hatched.
      </div>
    </div>
  );
}

function CrosstabLegend({ legend, measure, norm, direction }) {
  const gradientCss = (() => {
    if (legend.kind === "seq") {
      return "linear-gradient(to right, " + window.SEQ_STOPS.map((c,i)=>`${window.rgbStr(c)} ${i/(window.SEQ_STOPS.length-1)*100}%`).join(",") + ")";
    }
    const left  = window.DIV_STOPS_NEG.map((c,i)=>`${window.rgbStr(c)} ${i/(window.DIV_STOPS_NEG.length-1)*50}%`);
    const right = window.DIV_STOPS_POS.map((c,i)=>`${window.rgbStr(c)} ${50 + i/(window.DIV_STOPS_POS.length-1)*50}%`);
    return "linear-gradient(to right, " + [...left, ...right].join(",") + ")";
  })();
  const fmt = norm === "rate" && direction !== "net" ? window.fmtRate : (v) => window.fmtVal(v, measure);
  return (
    <div className="legend">
      <div className="leg-bar" style={{background: gradientCss}}></div>
      <div className="leg-ticks">
        <span>{fmt(legend.min)}</span>
        {legend.kind === "div" && <span>0</span>}
        <span>{fmt(legend.max)}</span>
      </div>
    </div>
  );
}

window.CrosstabHeatmap = CrosstabHeatmap;
