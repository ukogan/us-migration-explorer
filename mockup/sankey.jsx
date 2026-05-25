// Sankey — top-N state-pair flows. Totals only; single neutral hue.
const { useState: sUseState, useMemo: sUseMemo } = React;

const RIBBON_COLOR = "#b07a4a";       // muted warm neutral
const RIBBON_COLOR_NET = "#c45a2a";   // slightly stronger for Net dominance

function sFmt(v, measure) {
  if (v == null) return "—";
  if (measure === "agi") {
    if (Math.abs(v) >= 1e6) return "$"+(v/1e6).toFixed(2)+"B";
    if (Math.abs(v) >= 1e3) return "$"+(v/1e3).toFixed(1)+"M";
    return "$"+Math.round(v).toLocaleString()+"K";
  }
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+"M";
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+"K";
  return Math.round(v).toLocaleString();
}

function ribbonPath(x0, y0a, y0b, x1, y1a, y1b) {
  const mx = (x0 + x1) / 2;
  return `M ${x0} ${y0a}
          C ${mx} ${y0a}, ${mx} ${y1a}, ${x1} ${y1a}
          L ${x1} ${y1b}
          C ${mx} ${y1b}, ${mx} ${y0b}, ${x0} ${y0b} Z`;
}

function buildSankey(props) {
  const { year, direction, measure, norm, topN, pairFilter,
          selectedState } = props;

  const S = window.SOI.STATES;

  // The selectedState scopes the Sankey:
  //   - outflow / inflow: limit to flows where selectedState is the origin
  //     (outflow) or destination (inflow)
  //   - net: limit to pairs involving selectedState
  const scopeBySel = selectedState != null;

  // Build candidate flows
  const flows = [];
  const pushFlow = (o, d) => {
    const f_od = window.SOI.pairValue(year, o, d, measure);
    let total, rate = null;
    if (direction === "net") {
      const f_do = window.SOI.pairValue(year, d, o, measure);
      const a = (f_od === -1 || f_od == null) ? 0 : f_od;
      const b = (f_do === -1 || f_do == null) ? 0 : f_do;
      const net = a - b;
      if (net <= 0) return;
      total = net;
    } else {
      if (f_od === -1 || f_od == null || f_od <= 0) return;
      total = f_od;
      if (norm === "rate") {
        const stayerState = direction === "outflow" ? o : d;
        const denom = window.SOI.pairStayers(year, stayerState, measure);
        if (denom > 0) rate = total / (total + denom) * 1000;
      }
    }
    flows.push({ o, d, total, rate });
  };

  if (pairFilter) {
    pushFlow(pairFilter.o, pairFilter.d);
  } else {
    for (let i=0;i<S.length;i++){
      const o = S[i];
      for (let j=0;j<S.length;j++){
        if (i===j) continue;
        const d = S[j];
        if (scopeBySel) {
          if (direction === "outflow" && o !== selectedState) continue;
          if (direction === "inflow"  && d !== selectedState) continue;
          if (direction === "net" && o !== selectedState && d !== selectedState) continue;
        }
        pushFlow(o, d);
      }
    }
  }

  flows.sort((a,b) => b.total - a.total);
  const topFlows = pairFilter ? flows : flows.slice(0, topN);
  if (topFlows.length === 0) return null;

  // Layout
  const W = 1140, H = 540;
  const pad = { top: 24, bottom: 24, left: 90, right: 90 };
  const colX0 = pad.left;
  const colX1 = W - pad.right;

  const origins = new Map(), dests = new Map();
  for (const f of topFlows) {
    origins.set(f.o, (origins.get(f.o) ?? 0) + f.total);
    dests.set(f.d, (dests.get(f.d) ?? 0) + f.total);
  }
  const origList = [...origins.entries()].sort((a,b)=>b[1]-a[1]);
  const destList = [...dests.entries()].sort((a,b)=>b[1]-a[1]);

  const total = topFlows.reduce((s,f)=>s+f.total, 0);
  const gap = 4;
  const usableH = H - pad.top - pad.bottom - gap * (Math.max(origList.length, destList.length) - 1);
  const scale = usableH / total;

  const oNodes = {};
  let y = pad.top;
  for (const [name, val] of origList) {
    const h = val * scale;
    oNodes[name] = { y0: y, y1: y+h, val };
    y += h + gap;
  }
  const dNodes = {};
  y = pad.top;
  for (const [name, val] of destList) {
    const h = val * scale;
    dNodes[name] = { y0: y, y1: y+h, val };
    y += h + gap;
  }

  // Sort each origin's flows by destination order to reduce crossings
  const flowsByOrigin = {};
  for (const f of topFlows) (flowsByOrigin[f.o] ??= []).push(f);
  const destOrder = Object.fromEntries(destList.map(([n], i)=>[n, i]));
  for (const o in flowsByOrigin) flowsByOrigin[o].sort((a,b)=>destOrder[a.d]-destOrder[b.d]);
  const flowsByDest = {};
  for (const f of topFlows) (flowsByDest[f.d] ??= []).push(f);
  const origOrder = Object.fromEntries(origList.map(([n], i)=>[n, i]));
  for (const d in flowsByDest) flowsByDest[d].sort((a,b)=>origOrder[a.o]-origOrder[b.o]);

  for (const o in flowsByOrigin) {
    let cur = oNodes[o].y0;
    for (const f of flowsByOrigin[o]) {
      f._srcY0 = cur;
      f._srcY1 = cur + f.total * scale;
      cur = f._srcY1;
    }
  }
  for (const d in flowsByDest) {
    let cur = dNodes[d].y0;
    for (const f of flowsByDest[d]) {
      f._dstY0 = cur;
      f._dstY1 = cur + f.total * scale;
      cur = f._dstY1;
    }
  }

  return { W, H, colX0, colX1, scale, origList, destList, oNodes, dNodes, topFlows };
}

function Sankey(props) {
  const { measure, norm, direction, pairFilter, onClearPin,
          selectedState, onClearSelectedState } = props;
  const [topN, setTopN] = sUseState(20);
  const [hover, setHover] = sUseState(null);

  const layout = sUseMemo(() => buildSankey({ ...props, topN }), [
    props.year, props.direction, props.measure,
    props.norm, topN,
    JSON.stringify(pairFilter), selectedState,
  ]);

  if (!layout) {
    return (
      <div className="sankey-wrap empty">
        <div className="sankey-empty">
          <h2>Top flows</h2>
          <p>No flows match the current filters.</p>
        </div>
      </div>
    );
  }

  const { W, H, colX0, colX1, origList, destList, oNodes, dNodes, topFlows } = layout;
  const measureLabel = window.MEASURE_LABEL[measure];

  const subtitle = pairFilter
    ? `Pinned: ${window.SOI.STATE_NAMES[pairFilter.o]} → ${window.SOI.STATE_NAMES[pairFilter.d]}`
    : selectedState
      ? direction === "outflow" ? `Outflows from ${window.SOI.STATE_NAMES[selectedState]}, top ${topN}`
        : direction === "inflow" ? `Inflows into ${window.SOI.STATE_NAMES[selectedState]}, top ${topN}`
          : `Net pairs involving ${window.SOI.STATE_NAMES[selectedState]}, top ${topN}`
      : direction === "net"
        ? `Top ${topN} net flows (only dominant direction shown)`
        : `Top ${topN} ${direction === "inflow" ? "inflow" : "outflow"} ribbons across all 51 states`;

  const ribbonFill = direction === "net" ? RIBBON_COLOR_NET : RIBBON_COLOR;

  const ribbonEls = topFlows.map((f, idx) => {
    const path = ribbonPath(colX0, f._srcY0, f._srcY1, colX1, f._dstY0, f._dstY1);
    const isHover = hover && hover.flow === f;
    return (
      <g key={idx}
         className="ribbon"
         onMouseEnter={(e) => setHover({ flow: f, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
         onMouseMove={(e) => setHover({ flow: f, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
         onMouseLeave={() => setHover(null)}>
        <path d={path} fill={ribbonFill} fillOpacity={isHover ? 0.85 : 0.5} stroke="none" />
      </g>
    );
  });

  const oNodeEls = origList.map(([name, val]) => {
    const n = oNodes[name];
    return (
      <g key={name}>
        <rect x={colX0-8} y={n.y0} width={8} height={n.y1-n.y0} fill="#1a1a1a" />
        <text x={colX0-14} y={(n.y0+n.y1)/2} textAnchor="end" dominantBaseline="middle"
              fontSize={11} fill="#1a1a1a" fontWeight={500}>
          {name} <tspan fill="#7a6f5f" fontWeight={400}> {sFmt(val, measure)}</tspan>
        </text>
      </g>
    );
  });
  const dNodeEls = destList.map(([name, val]) => {
    const n = dNodes[name];
    return (
      <g key={name}>
        <rect x={colX1} y={n.y0} width={8} height={n.y1-n.y0} fill="#1a1a1a" />
        <text x={colX1+14} y={(n.y0+n.y1)/2} textAnchor="start" dominantBaseline="middle"
              fontSize={11} fill="#1a1a1a" fontWeight={500}>
          {name} <tspan fill="#7a6f5f" fontWeight={400}>{sFmt(val, measure)}</tspan>
        </text>
      </g>
    );
  });

  const pills = [];
  if (pairFilter) pills.push(
    <button key="pair" className="filter-pill" onClick={onClearPin}>
      Pair: {pairFilter.o} → {pairFilter.d} <span>×</span>
    </button>
  );
  if (selectedState && !pairFilter) pills.push(
    <button key="sel" className="filter-pill" onClick={onClearSelectedState}>
      State: {selectedState} <span>×</span>
    </button>
  );

  let tip = null;
  if (hover) {
    const f = hover.flow;
    tip = (
      <div className="sk-tip" style={{left: Math.min(hover.x+14, W-300), top: Math.min(hover.y+14, H-120)}}>
        <div className="tip-pair">
          <span className="tip-state">{window.SOI.STATE_NAMES[f.o]}</span>
          <span className="tip-arrow">→</span>
          <span className="tip-state">{window.SOI.STATE_NAMES[f.d]}</span>
        </div>
        <div className="tip-num">
          {sFmt(f.total, measure)} <span className="tip-meas"> {measureLabel}</span>
        </div>
        {f.rate != null && direction !== "net" && (
          <div className="tip-sub">{f.rate.toFixed(2)} per 1,000 non-migrants of {direction==="outflow"?f.o:f.d}</div>
        )}
        {direction === "net" && (
          <div className="tip-sub">Net flow ({f.o} loses {f.d} gains) — sign-dominated direction shown</div>
        )}
      </div>
    );
  }

  return (
    <div className="sankey-wrap">
      <div className="sankey-header">
        <div className="sankey-title">
          <h2>Top flows</h2>
          <div className="sankey-sub">{subtitle}</div>
        </div>
        <div className="sankey-controls">
          <div className="filter-pills">{pills}</div>
          {!pairFilter && (
            <div className="ctrl-inline">
              <span className="ctrl-label-inline">Top</span>
              <div className="seg seg-small">
                {[10,20,50].map(n => (
                  <button key={n} className={"seg-btn"+(topN===n?" on":"")} onClick={()=>setTopN(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sankey-body">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" className="sankey-svg">
          <text x={colX0-8} y={14} textAnchor="end" fontSize={10} fill="#7a6f5f" letterSpacing="0.08em">ORIGIN</text>
          <text x={colX1+8} y={14} textAnchor="start" fontSize={10} fill="#7a6f5f" letterSpacing="0.08em">DESTINATION</text>
          {ribbonEls}
          {oNodeEls}
          {dNodeEls}
        </svg>
        {tip}
      </div>
    </div>
  );
}

window.Sankey = Sankey;
