import { useState, useEffect, useMemo } from "react";
import { fetchJson } from "../utils/dataLoaders.js";

/* ── Formatters ── */
const fmt2 = (v) =>
  v == null || Number.isNaN(v)
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format USD billions: $1.23 T / $456.78 B / $234 M */
const fmtMCapB = (b) => {
  if (b == null) return "—";
  if (b >= 1000) return `$${(b / 1000).toFixed(2)} T`;
  if (b >= 1)    return `$${b.toFixed(2)} B`;
  return `$${(b * 1000).toFixed(0)} M`;
};

/* ── Distance from 52wk high badge ── */
const DistBadge = ({ pct }) => {
  const cls =
    pct <= 2  ? "dist-near"        :
    pct <= 5  ? "dist-mid"         :
                "dist-approaching";
  const label = pct <= 0.1 ? "AT HIGH" : `-${pct.toFixed(2)}%`;
  return <span className={`dist-badge ${cls}`}>{label}</span>;
};

/* ── TF count badge ── */
const TFCountBadge = ({ count }) => {
  const cls =
    count === 3 ? "tf-count-triple" :
    count === 2 ? "tf-count-double"  :
                  "tf-count-single";
  const label = count === 3 ? "Triple" : count === 2 ? "Double" : "Single";
  return <span className={`tf-count-badge ${cls}`}>{label}</span>;
};

/* ── Market cap badge (USD billions) ── */
const McapBadge = ({ b }) => {
  if (b == null) return <span className="muted" style={{ fontSize: 11 }}>—</span>;
  const cls =
    b >= 10   ? "mcap-large" :
    b >= 2    ? "mcap-mid"   :
    b >= 0.3  ? "mcap-small" : "mcap-micro";
  return <span className={`mcap-badge ${cls}`}>{fmtMCapB(b)}</span>;
};

/* ── Volume confirmation badge ── */
const VolumeBadge = ({ confirmed }) => {
  const cls   = confirmed ? "vol-confirmed" : "vol-unconfirmed";
  const label = confirmed ? "✅ Confirmed"  : "⬜ Unconfirmed";
  return <span className={`vol-badge ${cls}`}>{label}</span>;
};

/* ── Best vol-ratio badge ── */
const VolRatioBadge = ({ ratio, confirmed }) => {
  if (ratio == null) return <span className="muted" style={{ fontSize: 11 }}>—</span>;
  const icon = confirmed ? "✅" : "⬜";
  const cls  = confirmed ? "vol-ratio-confirmed" : "vol-ratio-unconfirmed";
  return <span className={`vol-ratio-badge ${cls}`}>{icon} {ratio.toFixed(2)}×</span>;
};

/* ── Per-timeframe breakout cell ── */
const TFBreakoutCell = ({ tf, label }) => {
  const [tip, setTip] = useState(false);

  if (!tf) {
    return (
      <td className="tf-cell tf-no">
        <span className="tf-miss">—</span>
      </td>
    );
  }

  const recencyClass =
    tf.days_ago <= 7  ? "bo-fresh"  :
    tf.days_ago <= 30 ? "bo-recent" :
                        "bo-old";

  return (
    <td
      className="tf-cell tf-hit"
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <div className="tf-inner">
        <span className={`bo-recency ${recencyClass}`}>
          {tf.days_ago === 0 ? "Today" : `${tf.days_ago}d ago`}
        </span>
        <div className="bo-price-row">
          <span className="bo-price">${fmt2(tf.breakout_price)}</span>
          <span className="bo-pct">+{tf.breakout_pct.toFixed(2)}%</span>
        </div>
        <div className="bo-resist">Res: ${fmt2(tf.resistance_level)}</div>
        <div className="bo-vol">
          {tf.volume_confirmed
            ? <span className="vol-yes" title="Volume confirmed">✅ {tf.vol_ratio}×</span>
            : <span className="vol-no"  title="Volume not confirmed">
                ⬜ {tf.vol_ratio != null ? `${tf.vol_ratio}×` : "—"}
              </span>
          }
        </div>
        {tip && (
          <div className="ch-tooltip">
            <div className="ch-tt-row"><b>{label} Chart Breakout</b></div>
            <div className="ch-tt-row">Date: {tf.breakout_date}</div>
            <div className="ch-tt-row">Days ago: {tf.days_ago}</div>
            <div className="ch-tt-sep" />
            <div className="ch-tt-row">Breakout price: ${fmt2(tf.breakout_price)}</div>
            <div className="ch-tt-row">Prior resistance: ${fmt2(tf.resistance_level)}</div>
            <div className="ch-tt-row">Broke above by: +{tf.breakout_pct.toFixed(2)}%</div>
            <div className="ch-tt-sep" />
            <div className="ch-tt-row">Volume ratio: {tf.vol_ratio != null ? `${tf.vol_ratio}×` : "—"}</div>
            <div className="ch-tt-row">Volume confirmed: {tf.volume_confirmed ? "✅ Yes" : "❌ No"}</div>
          </div>
        )}
      </div>
    </td>
  );
};

/* ── Filter definitions ── */
const DIST_FILTERS = [
  { label: "All",   key: "ALL" },
  { label: "≤ 2%",  key: "2",  test: (r) => r.dist_from_52wk_pct <= 2  },
  { label: "≤ 5%",  key: "5",  test: (r) => r.dist_from_52wk_pct <= 5  },
  { label: "≤ 10%", key: "10", test: (r) => r.dist_from_52wk_pct <= 10 },
];

const TF_FILTERS = [
  { label: "All TFs",     key: "ALL"    },
  { label: "Has Daily",   key: "HAS_D", test: (r) => r.daily   != null },
  { label: "Has Weekly",  key: "HAS_W", test: (r) => r.weekly  != null },
  { label: "Has Monthly", key: "HAS_M", test: (r) => r.monthly != null },
];

const COUNT_FILTERS = [
  { label: "All",          key: "ALL" },
  { label: "Triple D+W+M", key: "3",  test: (r) => r.breakout_tf_count === 3 },
  { label: "Double",       key: "2",  test: (r) => r.breakout_tf_count === 2 },
  { label: "Single",       key: "1",  test: (r) => r.breakout_tf_count === 1 },
];

const RECENCY_FILTERS = [
  { label: "All",   key: "ALL" },
  { label: "≤ 7d",  key: "7",  test: (r) => r.min_days_ago != null && r.min_days_ago <= 7  },
  { label: "≤ 14d", key: "14", test: (r) => r.min_days_ago != null && r.min_days_ago <= 14 },
  { label: "≤ 30d", key: "30", test: (r) => r.min_days_ago != null && r.min_days_ago <= 30 },
  { label: "≤ 90d", key: "90", test: (r) => r.min_days_ago != null && r.min_days_ago <= 90 },
];

const VOL_FILTERS = [
  { label: "All",           key: "ALL"         },
  { label: "✅ Confirmed",   key: "CONFIRMED",   test: (r) =>  r.vol_confirmed_any },
  { label: "⬜ Unconfirmed", key: "UNCONFIRMED", test: (r) => !r.vol_confirmed_any },
];

/** Market cap in USD billions */
const MCAP_FILTERS = [
  { label: "All",           key: "ALL" },
  { label: "Large ≥ $10B",  key: "LARGE",  test: (r) => r.market_cap_b != null && r.market_cap_b >= 10 },
  { label: "Mid $2–10B",    key: "MID",    test: (r) => r.market_cap_b != null && r.market_cap_b >= 2  && r.market_cap_b < 10 },
  { label: "Small < $2B",   key: "SMALL",  test: (r) => r.market_cap_b != null && r.market_cap_b < 2   && r.market_cap_b >= 0.3 },
  { label: "Micro < $300M", key: "MICRO",  test: (r) => r.market_cap_b != null && r.market_cap_b < 0.3 },
];

const VOL_RATIO_FILTERS = [
  { label: "All",    key: "ALL" },
  { label: "≥ 1.5×", key: "1.5", test: (r) => (r.max_vol_ratio ?? 0) >= 1.5 },
  { label: "≥ 2×",   key: "2",   test: (r) => (r.max_vol_ratio ?? 0) >= 2   },
  { label: "≥ 3×",   key: "3",   test: (r) => (r.max_vol_ratio ?? 0) >= 3   },
  { label: "≥ 5×",   key: "5",   test: (r) => (r.max_vol_ratio ?? 0) >= 5   },
];

const EUR_REGIONS  = ["Europe","Germany","France","UK","Netherlands","Sweden","Norway","Finland","Denmark","Switzerland","Italy","Spain","Belgium"];
const LATAM_REGIONS = ["LatAm","Brazil","Mexico","Chile","Colombia","Peru","Argentina","Panama"];

const REGION_FILTERS = [
  { label: "All Regions",     key: "ALL" },
  { label: "🇺🇸 US",           key: "US",              test: (r) => r.region === "US" },
  { label: "🌍 All Europe",    key: "Europe",           test: (r) => EUR_REGIONS.includes(r.region) },
  { label: "🇩🇪 Germany",      key: "Germany",          test: (r) => r.region === "Germany" },
  { label: "🇫🇷 France",       key: "France",           test: (r) => r.region === "France" },
  { label: "🇬🇧 UK",           key: "UK",               test: (r) => r.region === "UK" },
  { label: "🇳🇱 Netherlands",  key: "Netherlands",      test: (r) => r.region === "Netherlands" },
  { label: "🇨🇭 Switzerland",  key: "Switzerland",      test: (r) => r.region === "Switzerland" },
  { label: "🌐 Nordic",        key: "Nordic",           test: (r) => ["Sweden","Norway","Finland","Denmark"].includes(r.region) },
  { label: "🇮🇹 Italy",        key: "Italy",            test: (r) => r.region === "Italy" },
  { label: "🇪🇸 Spain",        key: "Spain",            test: (r) => r.region === "Spain" },
  { label: "🇧🇪 Belgium",      key: "Belgium",          test: (r) => r.region === "Belgium" },
  { label: "🇫🇮 Finland",      key: "Finland",          test: (r) => r.region === "Finland" },
  { label: "�🇨🇳 China",        key: "China",            test: (r) => r.region === "China" },
  { label: "🇯🇵 Japan",        key: "Japan",            test: (r) => r.region === "Japan" },
  { label: "🇰🇷 Korea",        key: "South Korea",      test: (r) => r.region === "South Korea" },
  { label: "🌎 All LatAm",     key: "LatAm",            test: (r) => LATAM_REGIONS.includes(r.region) },
  { label: "🇧🇷 Brazil",       key: "Brazil",           test: (r) => r.region === "Brazil" },
  { label: "🇲🇽 Mexico",       key: "Mexico",           test: (r) => r.region === "Mexico" },
  { label: "🌎 S.America",     key: "SouthAmerica",     test: (r) => ["Chile","Colombia","Peru","Argentina"].includes(r.region) },
  { label: "🇦🇷 Argentina",    key: "Argentina",        test: (r) => r.region === "Argentina" },
  { label: "🇿🇦 S.Africa",     key: "South Africa",     test: (r) => r.region === "South Africa" },
  { label: "🇮🇳 India",        key: "India",            test: (r) => r.region === "India" },
  { label: "🇹🇼 Taiwan",       key: "Taiwan",           test: (r) => r.region === "Taiwan" },
  { label: "🇦🇺 Australia",    key: "Australia",        test: (r) => r.region === "Australia" },
  { label: "🇨🇦 Canada",       key: "Canada",           test: (r) => r.region === "Canada" },
  { label: "🇸🇦 Saudi Arabia", key: "Saudi Arabia",    test: (r) => r.region === "Saudi Arabia" },
  { label: "🌐 Intl (Dev)",    key: "International",    test: (r) => r.region === "International" },
  { label: "🌍 EM",            key: "Emerging Markets", test: (r) => r.region === "Emerging Markets" },
];

const UNIVERSE_FILTERS = [
  { label: "All",        key: "ALL" },
  { label: "S&P 500",    key: "SP500",      test: (r) => r.universe === "SP500" },
  { label: "Nasdaq 100", key: "NDX100",     test: (r) => r.universe === "NDX100" },
  { label: "Global ADR", key: "GLOBAL_ADR", test: (r) => r.universe === "GLOBAL_ADR" },
  { label: "📊 ETF",      key: "ETF",        test: (r) => r.universe === "ETF" },
];

/* ── Main component ── */
const NearHighBreakout = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");

  const [distFilter,      setDistFilter]      = useState("ALL");
  const [tfFilter,        setTfFilter]        = useState("ALL");
  const [countFilter,     setCountFilter]     = useState("ALL");
  const [recencyFilter,   setRecencyFilter]   = useState("ALL");
  const [volFilter,       setVolFilter]       = useState("ALL");
  const [mcapFilter,      setMcapFilter]      = useState("ALL");
  const [volRatioFilter,  setVolRatioFilter]  = useState("ALL");
  const [regionFilter,    setRegionFilter]    = useState("ALL");
  const [universeFilter,  setUniverseFilter]  = useState("ALL");
  const [sortKey, setSortKey] = useState("score");
  const [sortDir, setSortDir] = useState("desc");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchJson("analysis_52wk_breakout.json");
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* ── Enrich each stock with best vol_ratio across all triggered TFs ── */
  const enrichedStocks = useMemo(() => {
    if (!data?.stocks) return [];
    return data.stocks.map((r) => {
      let best = { ratio: null, confirmed: false };
      for (const tf of [r.daily, r.weekly, r.monthly].filter(Boolean)) {
        if (tf.vol_ratio != null && (best.ratio === null || tf.vol_ratio > best.ratio))
          best = { ratio: tf.vol_ratio, confirmed: tf.volume_confirmed };
      }
      return { ...r, max_vol_ratio: best.ratio, max_vol_confirmed: best.confirmed };
    });
  }, [data]);

  /* ── Filtered + sorted rows ── */
  const rows = useMemo(() => {
    if (!data?.stocks) return [];
    const activeFilters = [
      DIST_FILTERS.find((f)       => f.key === distFilter),
      TF_FILTERS.find((f)         => f.key === tfFilter),
      COUNT_FILTERS.find((f)      => f.key === countFilter),
      RECENCY_FILTERS.find((f)    => f.key === recencyFilter),
      VOL_FILTERS.find((f)        => f.key === volFilter),
      MCAP_FILTERS.find((f)       => f.key === mcapFilter),
      VOL_RATIO_FILTERS.find((f)  => f.key === volRatioFilter),
      REGION_FILTERS.find((f)     => f.key === regionFilter),
      UNIVERSE_FILTERS.find((f)   => f.key === universeFilter),
    ];
    let list = enrichedStocks.filter((r) => {
      if (search && !r.stock.toLowerCase().includes(search.toLowerCase()) &&
          !(r.name || "").toLowerCase().includes(search.toLowerCase())) return false;
      for (const f of activeFilters) { if (f?.test && !f.test(r)) return false; }
      return true;
    });
    list = [...list].sort((a, b) => {
      const getVal = (row, key) => {
        if (key === "daily_days_ago")   return row.daily?.days_ago   ?? null;
        if (key === "weekly_days_ago")  return row.weekly?.days_ago  ?? null;
        if (key === "monthly_days_ago") return row.monthly?.days_ago ?? null;
        return row[key] ?? null;
      };
      let av = getVal(a, sortKey);
      let bv = getVal(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string") { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [enrichedStocks, search, distFilter, tfFilter, countFilter, recencyFilter, volFilter, mcapFilter, volRatioFilter, regionFilter, universeFilter, sortKey, sortDir]);

  /* ── Live pill counts ── */
  const cnt = (filters, key) => {
    if (!data?.stocks) return 0;
    const f = filters.find((x) => x.key === key);
    if (!f?.test) return enrichedStocks.length;
    return enrichedStocks.filter(f.test).length;
  };

  const TF_SORT_KEYS = new Set(["daily_days_ago", "weekly_days_ago", "monthly_days_ago"]);
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(TF_SORT_KEYS.has(key) ? "asc" : "desc"); }
  };
  const sortIcon = (key) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕";

  if (loading) return <div className="card">Loading 52-week high breakout data…</div>;
  if (error)   return (
    <div className="card">
      <div className="alert">{error}</div>
      <button className="btn-primary" onClick={load}>Retry</button>
    </div>
  );
  if (!data?.stocks?.length) return <div className="card"><p className="muted">No data found.</p></div>;

  return (
    <div className="card">

      {/* ── Header ── */}
      <div className="results-header">
        <div>
          <h2>🎯 Stocks Near 52-Week High with Breakout</h2>
          <p className="muted">
            Stocks within <b>10%</b> of their 52-week intraday high that have broken above
            a prior resistance ceiling on the daily, weekly, and/or monthly chart.
          </p>
        </div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-value">{data.total_scanned?.toLocaleString()}</div>
            <div className="stat-label">Scanned</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{data.total_detected}</div>
            <div className="stat-label">Near High</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{data.triple_tf}</div>
            <div className="stat-label">Triple TF</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{data.double_tf}</div>
            <div className="stat-label">Double TF</div>
          </div>
          <div className="stat-label">Generated: {data.generated_at}</div>
        </div>
      </div>

      {/* ── Universe filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🌐 Universe:</span>
        {UNIVERSE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill universe-pill ${universeFilter === f.key ? "active" : ""}`}
            onClick={() => setUniverseFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(UNIVERSE_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Region filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🗺️ Region:</span>
        {REGION_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill region-pill ${regionFilter === f.key ? "active" : ""}`}
            onClick={() => setRegionFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(REGION_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Distance filter ── */}
      <div className="signal-summary">
        <span className="filter-label">📍 Dist from 52-Wk High:</span>
        {DIST_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill near52-pill ${distFilter === f.key ? "active" : ""}`}
            onClick={() => setDistFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(DIST_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── TF count filter ── */}
      <div className="signal-summary">
        <span className="filter-label">📊 TF Count:</span>
        {COUNT_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill count-pill ${countFilter === f.key ? "active" : ""}`}
            onClick={() => setCountFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(COUNT_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Timeframe presence filter ── */}
      <div className="signal-summary">
        <span className="filter-label">⏱️ Timeframe:</span>
        {TF_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill tf-filter-pill ${tfFilter === f.key ? "active" : ""}`}
            onClick={() => setTfFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(TF_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Recency filter ── */}
      <div className="signal-summary">
        <span className="filter-label">📅 Breakout Recency:</span>
        {RECENCY_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill breakout-pill ${recencyFilter === f.key ? "active" : ""}`}
            onClick={() => setRecencyFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(RECENCY_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Volume filter ── */}
      <div className="signal-summary">
        <span className="filter-label">📈 Volume:</span>
        {VOL_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill volume-pill ${volFilter === f.key ? "active" : ""}`}
            onClick={() => setVolFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(VOL_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Vol Ratio filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🔊 Vol Ratio (Best TF):</span>
        {VOL_RATIO_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill vol-ratio-pill ${volRatioFilter === f.key ? "active" : ""}`}
            onClick={() => setVolRatioFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(VOL_RATIO_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Market Cap filter ── */}
      <div className="signal-summary">
        <span className="filter-label">🏦 Market Cap (USD):</span>
        {MCAP_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`signal-pill mcap-pill ${mcapFilter === f.key ? "active" : ""}`}
            onClick={() => setMcapFilter(f.key)}
          >
            {f.label} <span className="pill-count">{cnt(MCAP_FILTERS, f.key)}</span>
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="search-wrapper">
        <input
          type="text"
          className="input"
          placeholder="Search stock symbol or company name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Table ── */}
      <div className="table-wrapper">
        {rows.length === 0 ? (
          <p className="muted">No stocks match the selected filters.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th className="sortable" onClick={() => toggleSort("stock")}>Stock{sortIcon("stock")}</th>
                <th>Region</th>
                <th className="sortable" onClick={() => toggleSort("score")}>Score{sortIcon("score")}</th>
                <th className="sortable" onClick={() => toggleSort("dist_from_52wk_pct")} title="Distance below 52-week intraday high">
                  Dist 52-Wk{sortIcon("dist_from_52wk_pct")}
                </th>
                <th className="sortable" onClick={() => toggleSort("wk52_high")}>52-Wk High{sortIcon("wk52_high")}</th>
                <th className="sortable" onClick={() => toggleSort("breakout_tf_count")}>TF Count{sortIcon("breakout_tf_count")}</th>
                <th className="sortable" onClick={() => toggleSort("vol_confirmed_any")}>Vol Conf{sortIcon("vol_confirmed_any")}</th>
                <th className="sortable" onClick={() => toggleSort("max_vol_ratio")}>Best Vol{sortIcon("max_vol_ratio")}</th>
                <th className="tf-col-header sortable" onClick={() => toggleSort("daily_days_ago")}>
                  Daily Breakout{sortIcon("daily_days_ago")}
                </th>
                <th className="tf-col-header sortable" onClick={() => toggleSort("weekly_days_ago")}>
                  Weekly Breakout{sortIcon("weekly_days_ago")}
                </th>
                <th className="tf-col-header sortable" onClick={() => toggleSort("monthly_days_ago")}>
                  Monthly Breakout{sortIcon("monthly_days_ago")}
                </th>
                <th className="sortable" onClick={() => toggleSort("current_price")}>Price{sortIcon("current_price")}</th>
                <th className="sortable" onClick={() => toggleSort("market_cap_b")}>Mkt Cap{sortIcon("market_cap_b")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.stock}
                  className={
                    r.breakout_tf_count === 3 ? "ch-row-triple" :
                    r.breakout_tf_count === 2 ? "ch-row-double"  : ""
                  }
                >
                  <td className="rank-cell">{idx + 1}</td>

                  <td className="stock-symbol-cell">
                    {r.stock}
                    {r.name && (
                      <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{r.name}</div>
                    )}
                    <div className="muted" style={{ fontSize: 9 }}>{r.latest_date}</div>
                  </td>

                  <td>
                    <span className="region-badge">{r.region || "US"}</span>
                    {r.universe && (
                      <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{r.universe}</div>
                    )}
                  </td>

                  <td>
                    <span className="breakout-score-badge score-breakout-mid">{r.score}</span>
                  </td>

                  <td>
                    <DistBadge pct={r.dist_from_52wk_pct} />
                    <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>High {r.wk52_high_days_ago}d ago</div>
                  </td>

                  <td>
                    <span style={{ fontWeight: 700 }}>${fmt2(r.wk52_high)}</span>
                    <div className="muted" style={{ fontSize: 10 }}>{r.wk52_high_date}</div>
                  </td>

                  <td>
                    <TFCountBadge count={r.breakout_tf_count} />
                    <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>
                      {r.min_days_ago != null ? `latest ${r.min_days_ago}d ago` : ""}
                    </div>
                  </td>

                  <td>
                    <VolumeBadge confirmed={r.vol_confirmed_any} />
                  </td>

                  <td>
                    <VolRatioBadge ratio={r.max_vol_ratio} confirmed={r.max_vol_confirmed} />
                  </td>

                  <TFBreakoutCell tf={r.daily}   label="Daily"   />
                  <TFBreakoutCell tf={r.weekly}  label="Weekly"  />
                  <TFBreakoutCell tf={r.monthly} label="Monthly" />

                  <td style={{ fontWeight: 700 }}>${fmt2(r.current_price)}</td>
                  <td><McapBadge b={r.market_cap_b} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="results-footer">
        <p className="muted">Showing {rows.length} of {data.total_detected} stocks</p>
      </div>

      {/* ── Legend ── */}
      <div className="breakout-legend">
        <span className="legend-item" style={{ borderLeft: "4px solid #dc2626" }}>🔴 Red = Triple TF breakout</span>
        <span className="legend-item" style={{ borderLeft: "4px solid #7c3aed" }}>🟣 Purple = Double TF</span>
        <span className="legend-item">Daily: 30d consolidation, scan 30d</span>
        <span className="legend-item">Weekly: 8w consolidation, scan 8w</span>
        <span className="legend-item">Monthly: 6m consolidation, scan 6m</span>
        <span className="legend-item">✅ Vol = breakout bar ≥ 1.5× avg (US) / 1.3× (ADR)</span>
        <span className="legend-item">Hover cells for full detail</span>
      </div>
    </div>
  );
};

export default NearHighBreakout;
