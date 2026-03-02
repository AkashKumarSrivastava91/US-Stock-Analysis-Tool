"""
52-Week High Breakout Analyzer — US Markets
============================================

Identical algorithm to the Indian-market version with these adaptations:
  • Data directory  : stocks_data/  (yfinance CSVs for US/global symbols)
  • Market cap      : USD billions  (market_cap_b = market_cap / 1e9)
  • Universe meta   : reads region + universe from universe_master.csv
  • Output fields   : market_cap_b, region, universe  (instead of market_cap_cr)
  • VOL_CONFIRM_MULT: 1.3× for GLOBAL_ADR (thinner liquidity), 1.5× for US

Algorithm (unchanged):
  1. Stock must be within 10% of its 52-week intraday high.
  2. Detect breakout above consolidation resistance on daily/weekly/monthly.
  3. Score by proximity, TF count, volume confirmation, recency.
"""

import json
import math
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd

# ── Configuration ──────────────────────────────────────────────────────────────
DATA_DIR    = Path(__file__).parent / "stocks_data"
UNIV_FILE   = Path(__file__).parent / "universe" / "universe_master.csv"
OUTPUT_FILE = Path(__file__).parent / "analysis_52wk_breakout.json"


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None so json.dump produces valid JSON."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

DAYS_TO_LOAD         = 2600
WK52_LOOKBACK_DAYS   = 252
NEAR_52WK_THRESHOLD  = 0.10

DAILY_CONSOLIDATION   = 30
DAILY_SCAN            = 30
WEEKLY_CONSOLIDATION  = 8
WEEKLY_SCAN           = 8
MONTHLY_CONSOLIDATION = 6
MONTHLY_SCAN          = 6

VOL_CONFIRM_MULT      = 1.5     # US large-caps have liquid volume
VOL_CONFIRM_MULT_ADR  = 1.3     # ADRs can be thinner
DAILY_VOL_AVG_BARS    = 20
WEEKLY_VOL_AVG_BARS   = 10
MONTHLY_VOL_AVG_BARS  = 6
MIN_SCORE             = 10


# ── Universe meta ──────────────────────────────────────────────────────────────

def load_universe_meta() -> dict:
    if not UNIV_FILE.exists():
        return {}
    df = pd.read_csv(UNIV_FILE)
    return df.set_index("symbol").to_dict("index")


# ── Data loading ───────────────────────────────────────────────────────────────

def load_daily(symbol: str) -> Optional[pd.DataFrame]:
    csv_path = DATA_DIR / symbol / f"{symbol}_historical_10y.csv"
    if not csv_path.exists():
        return None
    df = pd.read_csv(csv_path)
    if not {"Date", "Open", "High", "Low", "Close"}.issubset(df.columns):
        return None
    df["Date"] = pd.to_datetime(df["Date"].astype(str).str[:10], errors="coerce")
    df.dropna(subset=["Date"], inplace=True)
    df.sort_values("Date", inplace=True)
    df = df.tail(DAYS_TO_LOAD).copy()
    df.set_index("Date", inplace=True)
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df.dropna(subset=["Open", "High", "Low", "Close"], inplace=True)
    return df if len(df) >= 60 else None


def load_market_cap_b(symbol: str) -> Optional[float]:
    """Return market cap in USD billions."""
    json_path = DATA_DIR / symbol / f"{symbol}.json"
    if not json_path.exists():
        return None
    try:
        with open(json_path) as fh:
            info = json.load(fh)
        mc = info.get("market_cap") or info.get("marketCap")
        if mc and float(mc) > 0:
            return round(float(mc) / 1e9, 3)
    except Exception:
        pass
    return None


def resample_weekly(daily: pd.DataFrame) -> pd.DataFrame:
    agg = {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    if "Volume" in daily.columns:
        agg["Volume"] = "sum"
    return daily.resample("W").agg(agg).dropna(subset=["Open", "Close"])


def resample_monthly(daily: pd.DataFrame) -> pd.DataFrame:
    agg = {"Open": "first", "High": "max", "Low": "min", "Close": "last"}
    if "Volume" in daily.columns:
        agg["Volume"] = "sum"
    return daily.resample("ME").agg(agg).dropna(subset=["Open", "Close"])


# ── 52-Week High ───────────────────────────────────────────────────────────────

def compute_52wk_high(daily: pd.DataFrame) -> dict:
    n      = min(WK52_LOOKBACK_DAYS, len(daily))
    period = daily.iloc[-n:]
    wk52_high = float(period["High"].max())
    touched   = period[period["High"] >= wk52_high * 0.995]
    wk52_date = touched.index[-1] if not touched.empty else period["High"].idxmax()
    today_date    = daily.index[-1]
    high_days_ago = max(0, (today_date - wk52_date).days)
    current_price = float(daily["Close"].iloc[-1])
    dist_pct      = (wk52_high - current_price) / wk52_high * 100
    return {
        "wk52_high":          round(wk52_high, 4),
        "wk52_high_date":     str(wk52_date.date()),
        "wk52_high_days_ago": high_days_ago,
        "dist_from_52wk_pct": round(dist_pct, 2),
    }


# ── Breakout Detection ─────────────────────────────────────────────────────────

def detect_tf_breakout(
    bars:          pd.DataFrame,
    consolidation: int,
    scan:          int,
    vol_avg_bars:  int,
    today_date,
    vol_mult:      float = VOL_CONFIRM_MULT,
) -> Optional[dict]:
    needed = consolidation + scan
    if len(bars) < needed:
        return None

    consol_bars = bars.iloc[-needed : -scan]
    scan_bars   = bars.iloc[-scan:]
    resistance  = float(consol_bars["Close"].max())
    resist_date = consol_bars["Close"].idxmax()

    breakout_idx = None
    for i in range(len(scan_bars)):
        if float(scan_bars["Close"].iloc[i]) > resistance:
            breakout_idx = i
            break

    if breakout_idx is None:
        return None

    bo_bar       = scan_bars.iloc[breakout_idx]
    bo_date      = scan_bars.index[breakout_idx]
    bo_price     = float(bo_bar["Close"])
    days_ago     = max(0, (today_date - bo_date).days)
    breakout_pct = (bo_price - resistance) / resistance * 100

    vol_confirmed = False
    vol_ratio     = None
    if "Volume" in bars.columns:
        n_vol = min(vol_avg_bars, len(bars) - scan)
        if n_vol > 0:
            vol_baseline = bars.iloc[-(scan + n_vol) : -scan]
            avg_vol = float(vol_baseline["Volume"].mean())
            bo_vol  = float(bo_bar["Volume"])
            if avg_vol > 0:
                vol_ratio     = round(bo_vol / avg_vol, 2)
                vol_confirmed = vol_ratio >= vol_mult

    return {
        "detected":         True,
        "breakout_date":    str(bo_date.date()),
        "days_ago":         days_ago,
        "breakout_price":   round(bo_price, 4),
        "resistance_level": round(resistance, 4),
        "resist_date":      str(resist_date.date()),
        "breakout_pct":     round(breakout_pct, 2),
        "volume_confirmed": bool(vol_confirmed),
        "vol_ratio":        vol_ratio,
    }


# ── Scoring ────────────────────────────────────────────────────────────────────

def compute_score(dist_pct: float, daily, weekly, monthly) -> int:
    score = 0
    if   dist_pct <= 2.0:  score += 30
    elif dist_pct <= 5.0:  score += 20
    elif dist_pct <= 10.0: score += 10

    min_days = None

    def add_tf(tf, base_pts):
        nonlocal score, min_days
        if tf is None:
            return
        score += base_pts
        if tf["volume_confirmed"]:
            score += 5
        d = tf["days_ago"]
        min_days = d if min_days is None else min(min_days, d)

    add_tf(daily,   15)
    add_tf(weekly,  20)
    add_tf(monthly, 25)

    if min_days is not None:
        if   min_days <= 7:  score += 10
        elif min_days <= 14: score += 7
        elif min_days <= 30: score += 3

    return score


# ── Per-stock analysis ─────────────────────────────────────────────────────────

def analyze_stock(symbol: str, meta: dict) -> Optional[dict]:
    daily = load_daily(symbol)
    if daily is None:
        return None

    wk52 = compute_52wk_high(daily)
    if wk52["dist_from_52wk_pct"] > NEAR_52WK_THRESHOLD * 100:
        return None

    today_date = daily.index[-1]
    market_cap_b = load_market_cap_b(symbol)
    weekly  = resample_weekly(daily)
    monthly = resample_monthly(daily)

    # Use lower vol threshold for ADRs (thinner liquidity)
    vol_mult = VOL_CONFIRM_MULT_ADR if meta.get("universe") == "GLOBAL_ADR" else VOL_CONFIRM_MULT

    d_res = detect_tf_breakout(daily,   DAILY_CONSOLIDATION,   DAILY_SCAN,   DAILY_VOL_AVG_BARS,   today_date, vol_mult)
    w_res = detect_tf_breakout(weekly,  WEEKLY_CONSOLIDATION,  WEEKLY_SCAN,  WEEKLY_VOL_AVG_BARS,  today_date, vol_mult)
    m_res = detect_tf_breakout(monthly, MONTHLY_CONSOLIDATION, MONTHLY_SCAN, MONTHLY_VOL_AVG_BARS, today_date, vol_mult)

    if not any([d_res, w_res, m_res]):
        return None

    dist_pct          = wk52["dist_from_52wk_pct"]
    score             = compute_score(dist_pct, d_res, w_res, m_res)
    breakout_tf_count = sum(1 for r in [d_res, w_res, m_res] if r is not None)

    if score < MIN_SCORE:
        return None

    all_days     = [r["days_ago"] for r in [d_res, w_res, m_res] if r is not None]
    min_days_ago = min(all_days) if all_days else None
    vol_any      = any(r["volume_confirmed"] for r in [d_res, w_res, m_res] if r is not None)

    return {
        "stock":             symbol,
        "name":              meta.get("name", ""),
        "region":            meta.get("region", "US"),
        "universe":          meta.get("universe", ""),
        "sector":            meta.get("sector", ""),
        "current_price":     round(float(daily["Close"].iloc[-1]), 4),
        "latest_date":       str(today_date.date()),
        **wk52,
        "breakout_tf_count": breakout_tf_count,
        "min_days_ago":      min_days_ago,
        "vol_confirmed_any": bool(vol_any),
        "market_cap_b":      market_cap_b,   # USD billions
        "score":             score,
        "daily":             d_res,
        "weekly":            w_res,
        "monthly":           m_res,
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    if not DATA_DIR.exists():
        print(f"✗ {DATA_DIR} does not exist. Run fetch_stock_data.py first.")
        return

    universe_meta = load_universe_meta()
    symbols       = sorted(d.name for d in DATA_DIR.iterdir() if d.is_dir())

    print("52-Week High Breakout Analyzer — US Markets")
    print(f"  Near threshold : within {NEAR_52WK_THRESHOLD * 100:.0f}% of 52-week intraday high")
    print(f"  Daily   : consolidation={DAILY_CONSOLIDATION}d, scan={DAILY_SCAN}d")
    print(f"  Weekly  : consolidation={WEEKLY_CONSOLIDATION}w, scan={WEEKLY_SCAN}w")
    print(f"  Monthly : consolidation={MONTHLY_CONSOLIDATION}m, scan={MONTHLY_SCAN}m")
    print(f"  Symbols : {len(symbols)}")
    print()

    results, errors = [], []

    for i, symbol in enumerate(symbols):
        if (i + 1) % 100 == 0:
            print(f"  [{i+1:4d}/{len(symbols)}]  {len(results)} matches so far …")
        meta = universe_meta.get(symbol, {})
        try:
            r = analyze_stock(symbol, meta)
            if r:
                results.append(r)
        except Exception as exc:
            errors.append({"stock": symbol, "error": str(exc)})

    results.sort(key=lambda x: x["score"], reverse=True)

    triple_tf = sum(1 for r in results if r["breakout_tf_count"] == 3)
    double_tf = sum(1 for r in results if r["breakout_tf_count"] == 2)
    single_tf = sum(1 for r in results if r["breakout_tf_count"] == 1)

    output = {
        "generated_at":      str(date.today()),
        "algorithm_version": "v1_us_markets",
        "market":            "US & Global (ADRs)",
        "parameters": {
            "daily":   {"consolidation": DAILY_CONSOLIDATION,   "scan": DAILY_SCAN,   "vol_avg_bars": DAILY_VOL_AVG_BARS},
            "weekly":  {"consolidation": WEEKLY_CONSOLIDATION,  "scan": WEEKLY_SCAN,  "vol_avg_bars": WEEKLY_VOL_AVG_BARS},
            "monthly": {"consolidation": MONTHLY_CONSOLIDATION, "scan": MONTHLY_SCAN, "vol_avg_bars": MONTHLY_VOL_AVG_BARS},
        },
        "total_scanned":  len(symbols),
        "total_detected": len(results),
        "triple_tf":      triple_tf,
        "double_tf":      double_tf,
        "single_tf":      single_tf,
        "errors":         len(errors),
        "stocks":         results,
    }

    with open(OUTPUT_FILE, "w") as fh:
        json.dump(_sanitize(output), fh, indent=2)

    print(f"\n✓ Done.")
    print(f"  Total detected : {len(results)}")
    print(f"  Triple TF      : {triple_tf}")
    print(f"  Double TF      : {double_tf}")
    print(f"  Single TF      : {single_tf}")
    print(f"  Errors         : {len(errors)}")
    print(f"  Output         : {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
