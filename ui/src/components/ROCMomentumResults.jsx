import { useState, useEffect } from "react";
import { fetchJson } from "../utils/dataLoaders.js";

/* ── Formatters ── */
const fmt = (v) =>
  v == null || Number.isNaN(v)
    ? "-"
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format USD billions: $1.23 T / $456.78 B / $234 M */
const fmtB = (v) => {
  if (v == null) return "-";
  if (v >= 1000) return `$${(v / 1000).toFixed(2)} T`;
  if (v >= 1)    return `$${v.toFixed(2)} B`;
  return `$${(v * 1000).toFixed(0)} M`;
};

/* ── Constants ── */
const SIGNAL_ORDER = ["ALL", "STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"];

const SIGNAL_CLASS = {
  "STRONG BUY":  "signal-strong-buy",
  BUY:           "signal-buy",
  HOLD:          "signal-hold",
  SELL:          "signal-sell",
  "STRONG SELL": "signal-strong-sell",
};

/** Market cap in USD billions */
const MCAP_FILTERS = [
  { label: "ALL",          key: "ALL" },
  { label: "Large ≥ $10B", key: "LARGE",  test: (m) => m != null && m >= 10 },
  { label: "Mid $2–10B",   key: "MID",    test: (m) => m != null && m >= 2  && m < 10 },
  { label: "Small < $2B",  key: "SMALL",  test: (m) => m != null && m < 2   && m >= 0.3 },
  { label: "Micro < $300M",key: "MICRO",  test: (m) => m != null && m < 0.3 },
];

const EUR_REGIONS   = ["Europe","Germany","France","UK","Netherlands","Sweden","Norway","Finland","Denmark","Switzerland","Italy","Spain","Belgium"];
const LATAM_REGIONS = ["LatAm","Brazil","Mexico","Chile","Colombia","Peru","Argentina","Panama"];

const REGION_FILTERS = [
  { label: "All Regions",     key: "ALL" },
  { label: "🇺🇸 US",           key: "US",              test: (s) => s.region === "US" },
  { label: "🌍 All Europe",    key: "Europe",           test: (s) => EUR_REGIONS.includes(s.region) },
  { label: "🇩🇪 Germany",      key: "Germany",          test: (s) => s.region === "Germany" },
  { label: "🇫🇷 France",       key: "France",           test: (s) => s.region === "France" },
  { label: "🇬🇧 UK",           key: "UK",               test: (s) => s.region === "UK" },
  { label: "🇳🇱 Netherlands",  key: "Netherlands",      test: (s) => s.region === "Netherlands" },
  { label: "🇨🇭 Switzerland",  key: "Switzerland",      test: (s) => s.region === "Switzerland" },
  { label: "🌐 Nordic",        key: "Nordic",           test: (s) => ["Sweden","Norway","Finland","Denmark"].includes(s.region) },
  { label: "🇮🇹 Italy",        key: "Italy",            test: (s) => s.region === "Italy" },
  { label: "🇪🇸 Spain",        key: "Spain",            test: (s) => s.region === "Spain" },
  { label: "🇧🇪 Belgium",      key: "Belgium",          test: (s) => s.region === "Belgium" },
  { label: "🇫🇮 Finland",      key: "Finland",          test: (s) => s.region === "Finland" },
  { label: "�🇨🇳 China",        key: "China",            test: (s) => s.region === "China" },
  { label: "🇯🇵 Japan",        key: "Japan",            test: (s) => s.region === "Japan" },
  { label: "🇰🇷 Korea",        key: "South Korea",      test: (s) => s.region === "South Korea" },
  { label: "🌎 All LatAm",     key: "LatAm",            test: (s) => LATAM_REGIONS.includes(s.region) },
  { label: "🇧🇷 Brazil",       key: "Brazil",           test: (s) => s.region === "Brazil" },
  { label: "🇲🇽 Mexico",       key: "Mexico",           test: (s) => s.region === "Mexico" },
  { label: "🌎 S.America",     key: "SouthAmerica",     test: (s) => ["Chile","Colombia","Peru","Argentina"].includes(s.region) },
  { label: "🇦🇷 Argentina",    key: "Argentina",        test: (s) => s.region === "Argentina" },
  { label: "🇿🇦 S.Africa",     key: "South Africa",     test: (s) => s.region === "South Africa" },
  { label: "🇮🇳 India",        key: "India",            test: (s) => s.region === "India" },
  { label: "🇹🇼 Taiwan",       key: "Taiwan",           test: (s) => s.region === "Taiwan" },
  { label: "🇦🇺 Australia",    key: "Australia",        test: (s) => s.region === "Australia" },
  { label: "🇨🇦 Canada",       key: "Canada",           test: (s) => s.region === "Canada" },
  { label: "🇸🇦 Saudi Arabia", key: "Saudi Arabia",    test: (s) => s.region === "Saudi Arabia" },
  { label: "🌐 Intl (Dev)",    key: "International",    test: (s) => s.region === "International" },
  { label: "🌍 EM",            key: "Emerging Markets", test: (s) => s.region === "Emerging Markets" },
];

const UNIVERSE_FILTERS = [
  { label: "All",         key: "ALL" },
  { label: "S&P 500",     key: "SP500",      test: (s) => s.universe === "SP500" },
  { label: "Nasdaq 100",  key: "NDX100",     test: (s) => s.universe === "NDX100" },
  { label: "Global ADR",  key: "GLOBAL_ADR", test: (s) => s.universe === "GLOBAL_ADR" },
  { label: "📊 ETF",       key: "ETF",        test: (s) => s.universe === "ETF" },
];

const THRESHOLD_CLASS = {
  "Strong Bullish": "thresh-strong-bull",
  Bullish:          "thresh-bull",
  Neutral:          "thresh-neutral",
  Bearish:          "thresh-bear",
  "Strong Bearish": "thresh-strong-bear",
};

const MA_TREND_CLASS = {
  "Golden Cross": "ma-golden",
  "Death Cross":  "ma-death",
};

const TRIGGER_FILTERS = [
  { label: "ALL",    key: "ALL" },
  { label: "≤ 7d",  key: "7",    test: (d) => d != null && d <= 7 },
  { label: "≤ 14d", key: "14",   test: (d) => d != null && d <= 14 },
  { label: "≤ 21d", key: "21",   test: (d) => d != null && d <= 21 },
  { label: "≤ 30d", key: "30",   test: (d) => d != null && d <= 30 },
  { label: "> 30d", key: "GT30", test: (d) => d != null && d > 30 },
  { label: "None",  key: "NONE", test: (d) => d == null },
];

const ROCMomentumResults = () => {
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [searchTerm, setSearchTerm]     = useState("");
  const [signalFilter, setSignalFilter] = useState(new Set(["ALL"]));
  const [mcapFilter, setMcapFilter]     = useState("ALL");
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [universeFilter, setUniverseFilter] = useState("ALL");
  const [rocTrigFilter, setRocTrigFilter]   = useState("ALL");
  const [maTrigFilter, setMaTrigFilter]     = useState("ALL");

  const toggleSignal = (sig) => {
    setSignalFilter((prev) => {
      const next = new Set(prev);
      if (sig === "ALL") return new Set(["ALL"]);
      next.delete("ALL");
      if (next.has(sig)) next.delete(sig);
      else next.add(sig);
      return next.size === 0 ? new Set(["ALL"]) : next;
    });
  };

  const loadResults = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await fetchJson("analysis_roc_momentum.json");
      setData(results);
    } catch (err) {
      setError(err.message || "Failed to load ROC momentum data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadResults(); }, []);

  /* ── Filtering ── */
  const filteredStocks =
    data?.data.filter((s) => {
      const matchesSearch   = s.stock.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (s.name  || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSignal   = signalFilter.has("ALL") || signalFilter.has(s.signal);
      const mcapDef         = MCAP_FILTERS.find((f) => f.key === mcapFilter);
      const matchesMcap     = mcapFilter === "ALL" || (mcapDef?.test && mcapDef.test(s.market_cap_b));
      const regionDef       = REGION_FILTERS.find((f) => f.key === regionFilter);
      const matchesRegion   = regionFilter === "ALL" || (regionDef?.test && regionDef.test(s));
      const univDef         = UNIVERSE_FILTERS.find((f) => f.key === universeFilter);
      const matchesUniverse = universeFilter === "ALL" || (univDef?.test && univDef.test(s));
      const rocTrigDef      = TRIGGER_FILTERS.find((f) => f.key === rocTrigFilter);
      const matchesRocTrig  = rocTrigFilter === "ALL" || (rocTrigDef?.test && rocTrigDef.test(s.roc_buy_trigger_days_ago));
      const maTrigDef       = TRIGGER_FILTERS.find((f) => f.key === maTrigFilter);
      const matchesMaTrig   = maTrigFilter === "ALL" || (maTrigDef?.test && maTrigDef.test(s.ma_buy_trigger_days_ago));
      return matchesSearch && matchesSignal && matchesMcap && matchesRegion && matchesUniverse && matchesRocTrig && matchesMaTrig;
    }) || [];

  if (loading) return <div className="card">Loading ROC momentum data…</div>;
  if (error)
    return (
      <div className="card">
        <div className="alert">{error}</div>
        <button className="btn-primary" onClick={loadResults}>Retry</button>
      </div>
    );
  if (!data?.data?.length)
    return <div className="card"><p className="muted">No ROC data found.</p></div>;

  const sc      = data.signal_counts || {};
  const periods = data.roc_periods   || [12, 25, 50];

  return (
    <div className="card">
      {/* ── Header ── */}
      <div className="results-header">
        <div>
          <h2>📈 Multi-Period ROC Momentum <small>(US &amp; Global)</small></h2>
          <p className="muted">
            ROC windows: {periods.join(", ")} days &nbsp;|&nbsp;
            MAs: {data.ma_periods?.join(", ")} &nbsp;|&nbsp;
            Accel look-back: {data.accel_lookback}d &nbsp;|&nbsp;
            Crossover scan: {data.crossover_lookback}d
          </p>
        </div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-value">{data.stocks_analyzed}</div>
            <div className="stat-label">Analyzed</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{data.stocks_with_data}</div>
            <div className="stat-label">With Data</div>
          </div>
          <div className="stat-label">Generated: {data.generated_at?.substring(0, 10)}</div>
        </div>
      </div>

      {/* ── Signal pills (multi-select) ── */}
      <div className="signal-summary">
        <span className="filter-label">Signal:</span>
        {SIGNAL_ORDER.map((sig) => {
          const count    = sig === "ALL" ? data.stocks_with_data : (sc[sig] || 0);
          const isActive = signalFilter.has(sig);
          return (
            <button
              key={sig}
              className={`signal-pill ${sig === "ALL" ? "signal-all" : SIGNAL_CLASS[sig]} ${isActive ? "active" : ""}`}
              onClick={() => toggleSignal(sig)}
            >
              {sig} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Universe filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🌐 Universe:</span>
        {UNIVERSE_FILTERS.map((f) => {
          const count = f.key === "ALL"
            ? data.stocks_with_data
            : data.data.filter((s) => f.test(s)).length;
          return (
            <button
              key={f.key}
              className={`signal-pill universe-pill ${universeFilter === f.key ? "active" : ""}`}
              onClick={() => setUniverseFilter(f.key)}
            >
              {f.label} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Region filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🗺️ Region:</span>
        {REGION_FILTERS.map((f) => {
          const count = f.key === "ALL"
            ? data.stocks_with_data
            : data.data.filter((s) => f.test(s)).length;
          return (
            <button
              key={f.key}
              className={`signal-pill region-pill ${regionFilter === f.key ? "active" : ""}`}
              onClick={() => setRegionFilter(f.key)}
            >
              {f.label} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Market Cap pills ── */}
      <div className="signal-summary mcap-filter-row">
        <span className="filter-label">Market Cap:</span>
        {MCAP_FILTERS.map((f) => {
          const count = f.key === "ALL"
            ? data.stocks_with_data
            : data.data.filter((s) => f.test(s.market_cap_b)).length;
          return (
            <button
              key={f.key}
              className={`signal-pill mcap-pill ${mcapFilter === f.key ? "active" : ""}`}
              onClick={() => setMcapFilter(f.key)}
            >
              {f.label} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── ROC Buy Trigger pills ── */}
      <div className="signal-summary trigger-filter-row">
        <span className="filter-label">🎯 ROC Trigger:</span>
        {TRIGGER_FILTERS.map((f) => {
          const count = f.key === "ALL"
            ? data.stocks_with_data
            : data.data.filter((s) => f.test(s.roc_buy_trigger_days_ago)).length;
          return (
            <button
              key={f.key}
              className={`signal-pill trigger-pill ${rocTrigFilter === f.key ? "active" : ""}`}
              onClick={() => setRocTrigFilter(f.key)}
            >
              {f.label} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── MA Buy Trigger pills ── */}
      <div className="signal-summary trigger-filter-row">
        <span className="filter-label">🎯 MA Trigger:</span>
        {TRIGGER_FILTERS.map((f) => {
          const count = f.key === "ALL"
            ? data.stocks_with_data
            : data.data.filter((s) => f.test(s.ma_buy_trigger_days_ago)).length;
          return (
            <button
              key={f.key}
              className={`signal-pill trigger-pill ${maTrigFilter === f.key ? "active" : ""}`}
              onClick={() => setMaTrigFilter(f.key)}
            >
              {f.label} <span className="pill-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div className="search-wrapper">
        <input
          type="text"
          className="input"
          placeholder="Search symbol or company name…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* ── Table ── */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Stock</th>
              <th>Region</th>
              <th>Signal</th>
              <th>Score</th>
              <th>Pctl</th>
              {periods.map((p) => (
                <th key={p}>ROC{p}</th>
              ))}
              <th>Accel</th>
              <th>MA Trend</th>
              <th>Short</th>
              <th>Medium</th>
              <th>🎯 ROC Trigger</th>
              <th>🎯 MA Trigger</th>
              <th>Mkt Cap</th>
              <th>Price</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.map((s) => (
              <tr
                key={s.stock}
                className={s.signal === "STRONG BUY" ? "highlight-row" : ""}
              >
                <td className="rank-cell">{s.rank}</td>
                <td className="stock-symbol-cell">
                  {s.stock}
                  {s.name && (
                    <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{s.name}</div>
                  )}
                </td>

                {/* Region + Universe */}
                <td>
                  <span className="region-badge">{s.region || "US"}</span>
                  {s.universe && (
                    <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{s.universe}</div>
                  )}
                </td>

                {/* Signal badge */}
                <td>
                  <span className={`signal-badge ${SIGNAL_CLASS[s.signal]}`}>
                    {s.signal}
                  </span>
                </td>

                {/* Score */}
                <td className={`score-cell ${s.score >= 0 ? "positive" : "negative"}`}>
                  <strong>{fmt(s.score)}</strong>
                </td>

                {/* Percentile */}
                <td className="pctl-cell">{s.percentile}%</td>

                {/* ROC cells */}
                {periods.map((p) => {
                  const val       = s[`roc${p}`];
                  const threshold = s[`roc${p}_threshold`];
                  const rising    = s[`roc${p}_rising`];
                  const coDays    = s[`roc${p}_crossover_days_ago`];
                  const coDate    = s[`roc${p}_crossover_date`];
                  const thClass   = THRESHOLD_CLASS[threshold] || "";
                  const tooltip   = `${threshold}${coDays != null ? ` — Crossed 0 → ${coDays}d ago (${coDate?.substring(0, 10)})` : " — No zero crossover in 30d"}`;
                  return (
                    <td key={p} className={`roc-cell ${thClass}`}>
                      <div className="has-tooltip" data-tooltip={tooltip}>
                        <span className={rising ? "rising-arrow" : "falling-arrow"}>
                          {rising ? "▲" : "▼"}
                        </span>{" "}
                        {fmt(val)}
                        {coDays != null && (
                          <span className="crossover-days">0✕ {coDays}d ago</span>
                        )}
                      </div>
                    </td>
                  );
                })}

                {/* Acceleration */}
                <td>
                  <span className={`accel-chip ${s.acceleration >= 0 ? "accel-up" : "accel-down"}`}>
                    {s.acceleration >= 0 ? "▲" : "▼"} {fmt(s.acceleration)}
                  </span>
                </td>

                {/* MA Trend */}
                <td>
                  <div
                    className="has-tooltip"
                    data-tooltip={
                      s.ma50_200_crossover_type
                        ? `${s.ma50_200_crossover_type} — ${s.ma50_200_crossover_days_ago}d ago (${s.ma50_200_crossover_date?.substring(0, 10)})`
                        : "No MA50/200 crossover in last 90 days"
                    }
                  >
                    <span className={`ma-badge ${MA_TREND_CLASS[s.ma_trend] || "ma-na"}`}>
                      {s.ma_trend === "Golden Cross" && "🐂 "}
                      {s.ma_trend === "Death Cross"  && "🐻 "}
                      {s.ma_trend}
                    </span>
                    {s.ma50_200_crossover_days_ago != null && (
                      <span className="crossover-days">
                        {s.ma50_200_crossover_type === "Golden Cross" ? "🐂" : "🐻"} {s.ma50_200_crossover_days_ago}d ago
                      </span>
                    )}
                  </div>
                </td>

                {/* Short-term trend */}
                <td>
                  <div
                    className="has-tooltip"
                    data-tooltip={
                      s.ma10_20_crossover_type
                        ? `MA10/MA20 ${s.ma10_20_crossover_type} — ${s.ma10_20_crossover_days_ago}d ago (${s.ma10_20_crossover_date?.substring(0, 10)})`
                        : "No MA10/20 crossover in last 90 days"
                    }
                  >
                    <span className={`trend-chip ${s.short_term_trend === "Bullish" ? "trend-bull" : s.short_term_trend === "Bearish" ? "trend-bear" : ""}`}>
                      {s.short_term_trend === "Bullish" ? "▲" : s.short_term_trend === "Bearish" ? "▼" : ""} {s.short_term_trend}
                    </span>
                    {s.ma10_20_crossover_days_ago != null && (
                      <span className="crossover-days">
                        {s.ma10_20_crossover_type === "Golden Cross" ? "🐂" : "🐻"} {s.ma10_20_crossover_days_ago}d ago
                      </span>
                    )}
                  </div>
                </td>

                {/* Medium-term trend */}
                <td>
                  <div
                    className="has-tooltip"
                    data-tooltip={
                      s.ma20_50_crossover_type
                        ? `MA20/MA50 ${s.ma20_50_crossover_type} — ${s.ma20_50_crossover_days_ago}d ago (${s.ma20_50_crossover_date?.substring(0, 10)})`
                        : "No MA20/50 crossover in last 90 days"
                    }
                  >
                    <span className={`trend-chip ${s.medium_term_trend === "Bullish" ? "trend-bull" : s.medium_term_trend === "Bearish" ? "trend-bear" : ""}`}>
                      {s.medium_term_trend === "Bullish" ? "▲" : s.medium_term_trend === "Bearish" ? "▼" : ""} {s.medium_term_trend}
                    </span>
                    {s.ma20_50_crossover_days_ago != null && (
                      <span className="crossover-days">
                        {s.ma20_50_crossover_type === "Golden Cross" ? "🐂" : "🐻"} {s.ma20_50_crossover_days_ago}d ago
                      </span>
                    )}
                  </div>
                </td>

                {/* ROC Buy Trigger */}
                <td>
                  {s.roc_buy_trigger_date ? (
                    <div
                      className="has-tooltip"
                      data-tooltip={`All ROCs crossed > 0 on ${s.roc_buy_trigger_date?.substring(0, 10)} @ $${fmt(s.roc_buy_trigger_price)}`}
                    >
                      <span className="trigger-badge trigger-active">
                        {s.roc_buy_trigger_days_ago}d ago
                      </span>
                      <span className="trigger-detail">
                        {s.roc_buy_trigger_date?.substring(5, 10)} &middot; ${fmt(s.roc_buy_trigger_price)}
                      </span>
                    </div>
                  ) : (
                    <span className="trigger-badge trigger-none">—</span>
                  )}
                </td>

                {/* MA Buy Trigger */}
                <td>
                  {s.ma_buy_trigger_date ? (
                    <div
                      className="has-tooltip"
                      data-tooltip={`MA10 crossed MA20 (MA10>MA20>MA50>MA200) on ${s.ma_buy_trigger_date?.substring(0, 10)} @ $${fmt(s.ma_buy_trigger_price)}`}
                    >
                      <span className="trigger-badge trigger-active">
                        {s.ma_buy_trigger_days_ago}d ago
                      </span>
                      <span className="trigger-detail">
                        {s.ma_buy_trigger_date?.substring(5, 10)} &middot; ${fmt(s.ma_buy_trigger_price)}
                      </span>
                    </div>
                  ) : (
                    <span className="trigger-badge trigger-none">—</span>
                  )}
                </td>

                {/* Mkt Cap (USD billions) */}
                <td className="mcap-cell">{fmtB(s.market_cap_b)}</td>

                {/* Price & Date */}
                <td>${fmt(s.current_price)}</td>
                <td className="date-cell">{s.latest_date?.substring(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ── */}
      <div className="results-footer">
        <p className="muted">
          Showing {filteredStocks.length} of {data.stocks_with_data} stocks
        </p>
      </div>
    </div>
  );
};

export default ROCMomentumResults;
