// Matrix heatmap — 51×51 state-pair flows. TOTALS ONLY (real IRS schema).
const { useState: mUseState, useMemo: mUseMemo, useEffect: mUseEffect, useRef: mUseRef } = React;

const MEASURE_LABEL = { returns: "returns", exemptions: "people", agi: "AGI ($K)" };
window.MEASURE_LABEL = MEASURE_LABEL;

function fmtVal(v, measure) {
  if (v == null) return "—";
  if (measure === "agi") {
    if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+"B";
    if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"M";
    return Math.round(v).toLocaleString();
  }
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Math.round(v).toLocaleString();
}
window.fmtVal = fmtVal;
function fmtRate(v) {
  if (v == null) return "—";
  return v.toFixed(2) + " / 1k";
}
window.fmtRate = fmtRate;

const SEQ_STOPS = [
  [253,247,239],
  [251,222,184],
  [246,184,124],
  [233,143, 80],
  [208,101, 47],
  [161, 70, 30],
  [105, 44, 18],
];
const DIV_STOPS_NEG = [
  [ 18, 58,110],
  [ 60,105,160],
  [115,159,205],
  [180,206,232],
  [232,238,248],
];
const DIV_STOPS_POS = [
  [248,232,228],
  [232,180,160],
  [212,130,100],
  [180, 70, 50],
  [120, 30, 20],
];
window.SEQ_STOPS = SEQ_STOPS;
window.DIV_STOPS_NEG = DIV_STOPS_NEG;
window.DIV_STOPS_POS = DIV_STOPS_POS;

function lerpStops(stops, t) {
  if (t <= 0) return stops[0];
  if (t >= 1) return stops[stops.length-1];
  const x = t * (stops.length-1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i], b = stops[i+1];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}
function rgbStr(c){ return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
function seqColor(t) { return lerpStops(SEQ_STOPS, t); }
function divColor(t) {
  if (t >= 0) return lerpStops(DIV_STOPS_POS, t);
  return lerpStops(DIV_STOPS_NEG.slice().reverse(), -t);
}
window.rgbStr = rgbStr;
window.seqColor = seqColor;
window.divColor = divColor;

// ---------------------------------------------------------------------------
// Compute the 51×51 display matrix from PAIR totals.
// Cells:
//   - null       = diagonal
//   - {sup:"irs"}= IRS-suppressed (raw -1)
//   - {v, abs}   = display value (rate or absolute) + raw absolute for tooltip
// ---------------------------------------------------------------------------
function computeMatrix({ year, direction, measure, norm }) {
  const S = window.SOI.STATES;
  const n = S.length;
  const rows = Array.from({length:n}, () => new Array(n).fill(null));
  let minV = Infinity, maxV = -Infinity, maxAbsNet = 0;

  for (let i=0;i<n;i++){
    const o = S[i];
    for (let j=0;j<n;j++){
      if (i===j) continue;
      const d = S[j];
      const f_od = window.SOI.pairValue(year, o, d, measure);

      if (direction === "net") {
        const f_do = window.SOI.pairValue(year, d, o, measure);
        if ((f_od == null || f_od === -1) && (f_do == null || f_do === -1)) {
          rows[i][j] = {sup:"irs"}; continue;
        }
        const a = (f_od === -1 || f_od == null) ? 0 : f_od;
        const b = (f_do === -1 || f_do == null) ? 0 : f_do;
        const v = a - b;
        if (Math.abs(v) > maxAbsNet) maxAbsNet = Math.abs(v);
        rows[i][j] = { v, abs: v };
      } else {
        if (f_od === -1 || f_od == null) { rows[i][j] = {sup:"irs"}; continue; }
        const abs = f_od;
        let v = abs;
        if (norm === "rate") {
          const stayerState = direction === "outflow" ? o : d;
          const denom = window.SOI.pairStayers(year, stayerState, measure);
          if (denom <= 0) { rows[i][j] = {sup:"thresh"}; continue; }
          v = f_od / (f_od + denom) * 1000;
        }
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
        rows[i][j] = { v, abs };
      }
    }
  }
  if (direction !== "net" && !isFinite(minV)) { minV = 0; maxV = 1; }
  return { rows, minV, maxV, maxAbsNet };
}

function getHatchPattern(ctx) {
  if (getHatchPattern._p) return getHatchPattern._p;
  const p = document.createElement("canvas");
  p.width = p.height = 6;
  const pctx = p.getContext("2d");
  pctx.fillStyle = "#ece6dd";
  pctx.fillRect(0,0,6,6);
  pctx.strokeStyle = "#cdc3b3";
  pctx.lineWidth = 1;
  pctx.beginPath();
  pctx.moveTo(-1, 7); pctx.lineTo(7, -1);
  pctx.moveTo(-1, 13); pctx.lineTo(13, -1);
  pctx.stroke();
  return (getHatchPattern._p = ctx.createPattern(p, "repeat"));
}

function MatrixHeatmap(props) {
  const {
    year, direction, measure, norm,
    selectedState, onSelectState,
    onSelectPair, selectedPair,
  } = props;

  const S = window.SOI.STATES;
  const n = S.length;
  const CELL = 16;
  const ROW_LBL = 56;
  const COL_LBL = 60;
  const W = ROW_LBL + n*CELL;
  const H = COL_LBL + n*CELL;

  const canvasRef = mUseRef(null);
  const overlayRef = mUseRef(null);
  const [hover, setHover] = mUseState(null);

  const data = mUseMemo(
    () => computeMatrix({ year, direction, measure, norm }),
    [year, direction, measure, norm]
  );

  mUseEffect(() => {
    const c = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = W*dpr; c.height = H*dpr;
    c.style.width = W+"px"; c.style.height = H+"px";
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    const { rows, minV, maxV, maxAbsNet } = data;
    const colorOf = (v) => {
      if (direction === "net") {
        const t = maxAbsNet === 0 ? 0 : v / maxAbsNet;
        return rgbStr(divColor(Math.max(-1, Math.min(1, t))));
      }
      const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV);
      return rgbStr(seqColor(Math.sqrt(Math.max(0, t))));
    };

    const hatch = getHatchPattern(ctx);

    for (let i=0;i<n;i++){
      for (let j=0;j<n;j++){
        const x = ROW_LBL + j*CELL;
        const y = COL_LBL + i*CELL;
        if (i===j) {
          ctx.fillStyle = "#e8e2d6";
          ctx.fillRect(x,y,CELL,CELL);
          continue;
        }
        const cell = rows[i][j];
        if (!cell) {
          ctx.fillStyle = "#f6f2ea";
          ctx.fillRect(x,y,CELL,CELL);
          continue;
        }
        if (cell.sup) {
          ctx.fillStyle = hatch;
          ctx.fillRect(x,y,CELL,CELL);
          continue;
        }
        ctx.fillStyle = colorOf(cell.v);
        ctx.fillRect(x,y,CELL,CELL);
      }
    }

    // Highlights for selected state (full row + full column)
    if (selectedState) {
      const i = S.indexOf(selectedState);
      if (i >= 0) {
        ctx.fillStyle = "rgba(26,26,26,0.06)";
        ctx.fillRect(ROW_LBL, COL_LBL + i*CELL, n*CELL, CELL);
        ctx.fillRect(ROW_LBL + i*CELL, COL_LBL, CELL, n*CELL);
      }
    }
    // Selected pair → row+col emphasis + stroke
    if (selectedPair) {
      const i = S.indexOf(selectedPair.o), j = S.indexOf(selectedPair.d);
      if (i>=0 && j>=0) {
        ctx.fillStyle = "rgba(26,26,26,0.08)";
        ctx.fillRect(ROW_LBL, COL_LBL + i*CELL, n*CELL, CELL);
        ctx.fillRect(ROW_LBL + j*CELL, COL_LBL, CELL, n*CELL);
        ctx.strokeStyle = "#1a1a1a";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ROW_LBL + j*CELL + 0.5, COL_LBL + i*CELL + 0.5, CELL-1, CELL-1);
      }
    }

    if (hover) {
      ctx.strokeStyle = "rgba(26,26,26,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ROW_LBL + hover.j*CELL + 0.5, COL_LBL + hover.i*CELL + 0.5, CELL-1, CELL-1);
    }
  }, [data, W, H, hover, selectedPair, selectedState, direction]);

  const onMove = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < ROW_LBL || y < COL_LBL) { setHover(null); return; }
    const j = Math.floor((x - ROW_LBL)/CELL);
    const i = Math.floor((y - COL_LBL)/CELL);
    if (i<0||i>=n||j<0||j>=n) { setHover(null); return; }
    setHover({ i, j, x, y });
  };
  const onLeave = () => setHover(null);

  const onClickCell = () => {
    if (!hover) return;
    const o = S[hover.i], d = S[hover.j];
    if (o === d) return;
    onSelectPair({ o, d });
  };

  // Row/col totals (for tooltip % framing)
  const rowTotals = mUseMemo(() => {
    const t = new Array(n).fill(0);
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) {
      const c = data.rows[i][j];
      if (c && !c.sup && i!==j && c.abs > 0) t[i] += c.abs;
    }
    return t;
  }, [data]);
  const colTotals = mUseMemo(() => {
    const t = new Array(n).fill(0);
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) {
      const c = data.rows[i][j];
      if (c && !c.sup && i!==j && c.abs > 0) t[j] += c.abs;
    }
    return t;
  }, [data]);

  let tip = null;
  if (hover) {
    const o = S[hover.i], d = S[hover.j];
    const cell = data.rows[hover.i][hover.j];
    let body;
    if (o === d) {
      body = <div className="tip-note">Same-state (intra-state moves are in the “samest” category of the cross-tab — see Section 2)</div>;
    } else if (!cell) {
      body = <div className="tip-note">No data</div>;
    } else if (cell.sup === "irs") {
      body = <div className="tip-note">Suppressed by IRS (cell too small for privacy)</div>;
    } else if (cell.sup === "thresh") {
      body = <div className="tip-note">No non-migrant denominator available</div>;
    } else {
      const pct = direction === "outflow"
        ? (rowTotals[hover.i] ? cell.abs/rowTotals[hover.i]*100 : 0)
        : (colTotals[hover.j] ? cell.abs/colTotals[hover.j]*100 : 0);
      const denomLabel = direction==="outflow" ? "of "+o+" total outflow"
        : direction==="inflow" ? "of "+d+" total inflow" : null;
      body = (
        <>
          <div className="tip-num">
            {norm==="rate" && direction!=="net" ? fmtRate(cell.v) : fmtVal(cell.v, measure)}
            <span className="tip-meas">
              {norm==="rate" && direction!=="net"
                ? ` per 1k ${direction==="outflow"?"non-migrants of "+o:"non-migrants of "+d}`
                : " "+MEASURE_LABEL[measure]}
            </span>
          </div>
          {direction!=="net" && (
            <div className="tip-sub">
              Absolute flow: {fmtVal(cell.abs, measure)} {MEASURE_LABEL[measure]}
              {denomLabel && <> · {pct.toFixed(1)}% {denomLabel}</>}
            </div>
          )}
          {direction==="net" && (
            <div className="tip-sub">
              {cell.v>0 ? `${o} → ${d} net outflow` : cell.v<0 ? `${o} ← ${d} net inflow` : "balanced"}
            </div>
          )}
          <div className="tip-brackets">Pair flows are totals only — bracket detail not available at this granularity.</div>
        </>
      );
    }
    const tipX = Math.min(hover.x + 14, W - 280);
    const tipY = Math.min(hover.y + 14, H - 100);
    tip = (
      <div className="tip" style={{left: tipX, top: tipY}}>
        <div className="tip-pair">
          <span className="tip-state">{window.SOI.STATE_NAMES[o]}</span>
          <span className="tip-arrow">→</span>
          <span className="tip-state">{window.SOI.STATE_NAMES[d]}</span>
        </div>
        {body}
      </div>
    );
  }

  const legend = mUseMemo(() => {
    if (direction === "net") {
      const m = data.maxAbsNet;
      return { kind:"div", min:-m, max:m };
    }
    return { kind:"seq", min:data.minV, max:data.maxV };
  }, [data, direction]);

  return (
    <div className="matrix-wrap">
      <div className="matrix-header">
        <div className="matrix-title">
          <h2>Origin → Destination matrix</h2>
          <div className="matrix-sub">
            {direction==="inflow" ? "Inflow into column state from row state" :
             direction==="outflow" ? "Outflow from row state to column state" :
             "Net migration, row state perspective — red = row loses to column, blue = row gains"}
            {norm==="rate" && direction!=="net" ? " · rate per 1,000 non-migrants" : ""}
          </div>
        </div>
        <Legend legend={legend} measure={measure} norm={norm} direction={direction} />
      </div>

      <div className="matrix-scroll">
        <div className="matrix-inner" style={{width: W, height: H, position:"relative"}}>
          <canvas ref={canvasRef} style={{display:"block", position:"absolute", left:0, top:0}} />

          {S.map((s, j) => {
            const x = ROW_LBL + j*CELL;
            const active = selectedState === s || (selectedPair && selectedPair.d === s);
            return (
              <div
                key={"c"+s}
                className={"col-label" + (active ? " active":"")}
                style={{left: x, top: 0, width: CELL, height: COL_LBL}}
                onClick={() => onSelectState(s)}
                title={`Select ${window.SOI.STATE_NAMES[s]}`}
              >
                <span>{s}</span>
              </div>
            );
          })}
          {S.map((s, i) => {
            const y = COL_LBL + i*CELL;
            const active = selectedState === s || (selectedPair && selectedPair.o === s);
            return (
              <div
                key={"r"+s}
                className={"row-label" + (active ? " active":"")}
                style={{left: 0, top: y, width: ROW_LBL, height: CELL}}
                onClick={() => onSelectState(s)}
                title={`Select ${window.SOI.STATE_NAMES[s]}`}
              >{s}</div>
            );
          })}

          <div
            ref={overlayRef}
            className="matrix-overlay"
            style={{position:"absolute", left:0, top:0, width:W, height:H}}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            onClick={onClickCell}
          />
          {tip}
        </div>
      </div>

      <div className="matrix-caption">
        State-pair flows are published as totals only.
        To explore bracket detail, see the AGI × age view below.
      </div>
    </div>
  );
}

function Legend({ legend, measure, norm, direction }) {
  const gradientCss = (() => {
    if (legend.kind === "seq") {
      return "linear-gradient(to right, " + SEQ_STOPS.map((c,i)=>`${rgbStr(c)} ${i/(SEQ_STOPS.length-1)*100}%`).join(",") + ")";
    }
    const left  = DIV_STOPS_NEG.map((c,i)=>`${rgbStr(c)} ${i/(DIV_STOPS_NEG.length-1)*50}%`);
    const right = DIV_STOPS_POS.map((c,i)=>`${rgbStr(c)} ${50 + i/(DIV_STOPS_POS.length-1)*50}%`);
    return "linear-gradient(to right, " + [...left, ...right].join(",") + ")";
  })();
  const fmt = norm === "rate" && direction!=="net" ? fmtRate : (v)=>fmtVal(v,measure);
  return (
    <div className="legend">
      <div className="leg-bar" style={{background: gradientCss}}></div>
      <div className="leg-ticks">
        <span>{fmt(legend.min)}</span>
        {legend.kind === "div" && <span>0</span>}
        <span>{fmt(legend.max)}</span>
      </div>
      <div className="leg-suffix">
        {norm==="rate" && direction!=="net" ? "rate per 1,000 non-migrants" : MEASURE_LABEL[measure]}
        {direction==="net" && " · net (row perspective)"}
      </div>
    </div>
  );
}

window.MatrixHeatmap = MatrixHeatmap;
