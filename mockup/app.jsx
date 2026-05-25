// Main app — coordinates control bar, pair view (Section 1), and crosstab (Section 2).
const { useState: aUseState } = React;

function App() {
  const [year, setYear]                     = aUseState(2022);
  const [direction, setDirection]           = aUseState("outflow");
  const [measure, setMeasure]               = aUseState("returns");
  const [norm, setNorm]                     = aUseState("absolute"); // pair-view norm
  const [selectedState, setSelectedState]   = aUseState("CA");
  const [pairFilter, setPairFilter]         = aUseState(null);
  const [bannerOpen, setBannerOpen]         = aUseState(true);

  const onSelectPair = (p) => {
    setPairFilter(prev => (prev && prev.o === p.o && prev.d === p.d) ? null : p);
  };
  const onSelectState = (s) => {
    setSelectedState(prev => prev === s ? null : s);
    setPairFilter(null);
  };

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-inner">
          <div className="brand">
            <div className="brand-mark"></div>
            <div>
              <h1>State-to-State Migration</h1>
              <div className="subtitle">IRS Statistics of Income · explore where filers move and who moves, 2011–2022</div>
            </div>
          </div>
          <div className="hdr-note">Mock fixture — wire real SOI CSV at <code>data.jsx</code></div>
        </div>
      </header>

      {bannerOpen && (
        <div className="data-banner">
          <span className="banner-tag">DATA NOTE</span>
          State-pair flows and bracket detail come from separate IRS files and cannot be joined. A “CA → FL, 65+ &amp; $200K+” filter does not exist in the public data.
          <button className="banner-close" aria-label="Dismiss" onClick={() => setBannerOpen(false)}>×</button>
        </div>
      )}

      <ControlBar
        year={year} setYear={setYear}
        direction={direction} setDirection={setDirection}
        measure={measure} setMeasure={setMeasure}
        norm={norm} setNorm={setNorm}
        selectedState={selectedState} setSelectedState={onSelectState}
      />

      <main className="main">
        <section className="section">
          <div className="section-head">
            <div className="section-eyebrow">Section 1</div>
            <h2 className="section-title">Where people moved</h2>
            <div className="section-desc">State-pair flows (totals only, from stateinflow / stateoutflow files).</div>
          </div>
          <MatrixHeatmap
            year={year} direction={direction} measure={measure} norm={norm}
            selectedState={selectedState} onSelectState={onSelectState}
            onSelectPair={onSelectPair} selectedPair={pairFilter}
          />
          <Sankey
            year={year} direction={direction} measure={measure} norm={norm}
            selectedState={selectedState}
            onClearSelectedState={() => setSelectedState(null)}
            topN={20}
            pairFilter={pairFilter} onClearPin={() => setPairFilter(null)}
          />
        </section>

        <section className="section">
          <div className="section-head">
            <div className="section-eyebrow">Section 2</div>
            <h2 className="section-title">Who moved</h2>
            <div className="section-desc">AGI × age cross-tab for the selected state (gross migration file, per-state aggregate).</div>
          </div>
          <CrosstabHeatmap
            year={year} direction={direction} measure={measure}
            selectedState={selectedState}
          />
        </section>
      </main>

      <footer className="ftr">
        <div>SOI Migration Explorer · prototype · data is plausible synthetic for 2011–2022</div>
        <div className="ftr-legend">
          <span className="ftr-swatch hatched"></span>
          <span>Suppressed (IRS privacy or below 500-stayer denominator at the cross-tab level)</span>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
