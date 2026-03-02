import { useState } from "react";
import ROCMomentumResults from "./components/ROCMomentumResults.jsx";
import NearHighBreakout from "./components/NearHighBreakout.jsx";

const App = () => {
  const [activeAnalysis, setActiveAnalysis] = useState("roc");

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>🌐 US &amp; Global Stock Analysis Tool</h1>
          <p className="muted">
            S&amp;P 500 · Nasdaq 100 · Global ADRs — Momentum &amp; Breakout Analysis
          </p>
        </div>
        <div className="tag">React UI</div>
      </header>

      <div className="analysis-buttons">
        <button
          className={`analysis-btn ${activeAnalysis === "roc" ? "active" : ""}`}
          onClick={() => setActiveAnalysis("roc")}
        >
          📈 Momentum Stocks (ROC)
        </button>
        <button
          className={`analysis-btn ${activeAnalysis === "near52wk" ? "active" : ""}`}
          onClick={() => setActiveAnalysis("near52wk")}
        >
          🎯 Near 52-Wk High Breakouts
        </button>
      </div>

      {activeAnalysis === "roc"      && <ROCMomentumResults />}
      {activeAnalysis === "near52wk" && <NearHighBreakout />}
    </div>
  );
};

export default App;
