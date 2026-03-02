"""
Rate of Change (ROC) Multi-Period Momentum Analyzer — US Markets
=================================================================

Identical algorithm to the Indian-market version with these adaptations:
  • Data directory  : stocks_data/  (yfinance CSVs for US/global symbols)
  • Market cap      : USD billions  (market_cap_b = market_cap / 1e9)
  • Universe meta   : reads region + universe from universe_master.csv
  • Output fields   : market_cap_b, region, universe  (instead of market_cap_cr)

Signal Logic (unchanged):
    STRONG BUY  – All 3 ROCs > 0, all rising, price > MA50, price > MA200
    BUY         – All 3 ROCs > 0, price > MA50
    HOLD        – 2 of 3 ROCs > 0 (mixed)
    SELL        – Only 1 of 3 ROCs > 0
    STRONG SELL – All 3 ROCs ≤ 0, price < MA50 & MA200
"""

import csv
import json
import math
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

# ── Configuration ──────────────────────────────────────────────────────────────
ROC_PERIODS           = [12, 25, 50]
SCORE_WEIGHTS         = {12: 0.20, 25: 0.30, 50: 0.50}
ACCEL_LOOKBACK        = 5
CROSSOVER_LOOKBACK    = 30
RISING_LOOKBACK       = 3
MA_PERIODS            = [10, 20, 50, 200]
MA_CROSSOVER_LOOKBACK = 90
MA_CROSSOVER_PAIRS    = [(10, 20), (20, 50), (50, 200)]
TRIGGER_LOOKBACK      = 90
MIN_TRADING_DAYS      = max(MA_PERIODS) + max(MA_CROSSOVER_LOOKBACK, TRIGGER_LOOKBACK) + ACCEL_LOOKBACK + 10  # 305

DATA_DIR    = Path(__file__).parent / "stocks_data"
UNIV_FILE   = Path(__file__).parent / "universe" / "universe_master.csv"
OUTPUT_FILE = Path(__file__).parent / "analysis_roc_momentum.json"


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None so json.dump produces valid JSON."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


# ── Universe meta ──────────────────────────────────────────────────────────────

def load_universe_meta() -> dict:
    """Returns {symbol: {region, universe, sector, name}} from universe_master.csv."""
    if not UNIV_FILE.exists():
        return {}
    df = pd.read_csv(UNIV_FILE)
    return df.set_index("symbol").to_dict("index")


# ── Helper functions (identical to Indian version) ─────────────────────────────

def parse_csv_date(date_str):
    try:
        dt = datetime.fromisoformat(date_str)
        return dt.replace(tzinfo=None).date()
    except Exception:
        return None


def load_recent_trading_days(csv_path, num_days):
    rows = []
    cutoff_date = datetime.now().date() - timedelta(days=num_days * 2)
    try:
        with open(csv_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    date_obj = parse_csv_date(row["Date"])
                    if date_obj is None or date_obj < cutoff_date:
                        continue
                    rows.append((row["Date"], float(row["Close"])))
                except (ValueError, KeyError):
                    continue
    except Exception as e:
        print(f"  Error reading {csv_path}: {e}")
        return []
    if len(rows) < num_days:
        return []
    return rows[-num_days:]


def compute_single_roc(prices, idx, period):
    if idx < period:
        return None
    ref = prices[idx - period]
    if ref == 0:
        return None
    return ((prices[idx] - ref) / ref) * 100


def compute_sma(prices, idx, period):
    if idx < period - 1:
        return None
    window = prices[idx - period + 1 : idx + 1]
    return sum(window) / len(window)


def get_roc_threshold(roc_val):
    if roc_val > 10:    return "Strong Bullish"
    elif roc_val > 2:   return "Bullish"
    elif roc_val >= -2: return "Neutral"
    elif roc_val >= -10:return "Bearish"
    else:               return "Strong Bearish"


def find_zero_crossover(prices, dates, last_idx, period, lookback):
    for i in range(last_idx, max(last_idx - lookback, period), -1):
        roc_today     = compute_single_roc(prices, i,     period)
        roc_yesterday = compute_single_roc(prices, i - 1, period)
        if roc_today is not None and roc_yesterday is not None:
            if roc_today > 0 and roc_yesterday <= 0:
                return (dates[i], last_idx - i)
    return (None, None)


def find_ma_crossover(prices, dates, last_idx, fast_period, slow_period, lookback):
    min_idx = max(last_idx - lookback, slow_period)
    for i in range(last_idx, min_idx, -1):
        fast_today     = compute_sma(prices, i,     fast_period)
        slow_today     = compute_sma(prices, i,     slow_period)
        fast_yesterday = compute_sma(prices, i - 1, fast_period)
        slow_yesterday = compute_sma(prices, i - 1, slow_period)
        if all(v is not None for v in (fast_today, slow_today, fast_yesterday, slow_yesterday)):
            if fast_today > slow_today and fast_yesterday <= slow_yesterday:
                return ("Golden Cross", dates[i], last_idx - i)
            if fast_today < slow_today and fast_yesterday >= slow_yesterday:
                return ("Death Cross", dates[i], last_idx - i)
    return (None, None, None)


def find_roc_buy_trigger(prices, dates, last_idx, roc_periods, lookback):
    min_idx = max(max(roc_periods), last_idx - lookback)
    for i in range(last_idx, min_idx, -1):
        rocs_today     = [compute_single_roc(prices, i,     p) for p in roc_periods]
        rocs_yesterday = [compute_single_roc(prices, i - 1, p) for p in roc_periods]
        if any(r is None for r in rocs_today) or any(r is None for r in rocs_yesterday):
            continue
        if all(r > 0 for r in rocs_today) and not all(r > 0 for r in rocs_yesterday):
            return (dates[i], last_idx - i, round(prices[i], 4))
    return (None, None, None)


def find_ma_buy_trigger(prices, dates, last_idx, lookback):
    min_idx = max(200, last_idx - lookback)
    for i in range(last_idx, min_idx, -1):
        ma10_today  = compute_sma(prices, i,     10)
        ma20_today  = compute_sma(prices, i,     20)
        ma50_today  = compute_sma(prices, i,     50)
        ma200_today = compute_sma(prices, i,     200)
        ma10_yest   = compute_sma(prices, i - 1, 10)
        ma20_yest   = compute_sma(prices, i - 1, 20)
        if any(v is None for v in (ma10_today, ma20_today, ma50_today, ma200_today, ma10_yest, ma20_yest)):
            continue
        if (ma10_today > ma20_today and ma10_yest <= ma20_yest
                and ma20_today > ma50_today and ma50_today > ma200_today):
            return (dates[i], last_idx - i, round(prices[i], 4))
    return (None, None, None)


def check_roc_rising(prices, last_idx, period, lookback=3):
    roc_now  = compute_single_roc(prices, last_idx,            period)
    roc_prev = compute_single_roc(prices, last_idx - lookback, period)
    if roc_now is not None and roc_prev is not None:
        return roc_now > roc_prev
    return False


def generate_signal(roc_values, rising_flags,
                    price_above_ma10, price_above_ma20,
                    price_above_ma50, price_above_ma200):
    positive_count = sum(1 for v in roc_values.values() if v is not None and v > 0)
    all_rising = all(rising_flags.values())
    if (positive_count == 3 and all_rising
            and price_above_ma10 and price_above_ma20
            and price_above_ma50 and price_above_ma200):
        return "STRONG BUY"
    elif (positive_count == 3
              and price_above_ma10 and price_above_ma20 and price_above_ma50):
        return "BUY"
    elif positive_count >= 2:
        return "HOLD"
    elif positive_count == 1:
        return "SELL"
    else:
        if not any([price_above_ma10, price_above_ma20, price_above_ma50, price_above_ma200]):
            return "STRONG SELL"
        return "SELL"


# ── Market cap (USD billions) ──────────────────────────────────────────────────

def load_market_cap_b(stock_dir: Path):
    """Read marketCap from JSON, return value in USD billions."""
    json_path = stock_dir / f"{stock_dir.name}.json"
    if not json_path.exists():
        return None
    try:
        with open(json_path) as f:
            info = json.load(f)
        raw = info.get("market_cap") or info.get("marketCap")
        if raw and float(raw) > 0:
            return round(float(raw) / 1e9, 3)
    except Exception:
        pass
    return None


# ── Core analysis ──────────────────────────────────────────────────────────────

def analyze_stock(symbol: str, csv_path: Path, stock_dir: Path, meta: dict):
    data = load_recent_trading_days(csv_path, num_days=MIN_TRADING_DAYS)
    if not data:
        return None

    dates    = [row[0] for row in data]
    prices   = [row[1] for row in data]
    last_idx = len(prices) - 1

    roc_values = {}
    for period in ROC_PERIODS:
        roc = compute_single_roc(prices, last_idx, period)
        if roc is None:
            return None
        roc_values[f"roc{period}"] = round(roc, 2)

    thresholds = {f"roc{p}_threshold": get_roc_threshold(roc_values[f"roc{p}"]) for p in ROC_PERIODS}

    accel_values = {}
    earlier_idx  = last_idx - ACCEL_LOOKBACK
    for period in ROC_PERIODS:
        roc_now     = compute_single_roc(prices, last_idx,    period)
        roc_earlier = compute_single_roc(prices, earlier_idx, period)
        accel_values[f"accel{period}"] = round(roc_now - roc_earlier, 2) if (roc_now and roc_earlier) else 0.0

    score        = sum(roc_values[f"roc{p}"] * SCORE_WEIGHTS[p] for p in ROC_PERIODS)
    acceleration = sum(accel_values[f"accel{p}"] * SCORE_WEIGHTS[p] for p in ROC_PERIODS)

    crossovers = {}
    for period in ROC_PERIODS:
        co_date, co_days = find_zero_crossover(prices, dates, last_idx, period, CROSSOVER_LOOKBACK)
        crossovers[f"roc{period}_crossover_date"]    = co_date
        crossovers[f"roc{period}_crossover_days_ago"] = co_days

    rising_flags  = {}
    rising_output = {}
    for period in ROC_PERIODS:
        is_rising = check_roc_rising(prices, last_idx, period, RISING_LOOKBACK)
        rising_flags[f"roc{period}"]        = is_rising
        rising_output[f"roc{period}_rising"] = is_rising

    ma10  = compute_sma(prices, last_idx, 10)
    ma20  = compute_sma(prices, last_idx, 20)
    ma50  = compute_sma(prices, last_idx, 50)
    ma200 = compute_sma(prices, last_idx, 200)
    current_price = prices[last_idx]

    price_above_ma10  = ma10  is not None and current_price > ma10
    price_above_ma20  = ma20  is not None and current_price > ma20
    price_above_ma50  = ma50  is not None and current_price > ma50
    price_above_ma200 = ma200 is not None and current_price > ma200

    ma_trend        = ("Golden Cross" if ma50 and ma200 and ma50 > ma200 else
                       "Death Cross"  if ma50 and ma200 else "Insufficient Data")
    short_term_trend  = ("Bullish" if ma10 and ma20 and ma10 > ma20 else
                         "Bearish" if ma10 and ma20 else "Unknown")
    medium_term_trend = ("Bullish" if ma20 and ma50 and ma20 > ma50 else
                         "Bearish" if ma20 and ma50 else "Unknown")

    ma_crossover_data = {}
    for fast, slow in MA_CROSSOVER_PAIRS:
        co_type, co_date, co_days = find_ma_crossover(prices, dates, last_idx, fast, slow, MA_CROSSOVER_LOOKBACK)
        key = f"ma{fast}_{slow}"
        ma_crossover_data[f"{key}_crossover_type"]     = co_type
        ma_crossover_data[f"{key}_crossover_date"]     = co_date
        ma_crossover_data[f"{key}_crossover_days_ago"] = co_days

    roc_trig_date, roc_trig_days, roc_trig_price = find_roc_buy_trigger(prices, dates, last_idx, ROC_PERIODS, TRIGGER_LOOKBACK)
    ma_trig_date,  ma_trig_days,  ma_trig_price  = find_ma_buy_trigger(prices, dates, last_idx, TRIGGER_LOOKBACK)

    signal = generate_signal(roc_values, rising_flags,
                             price_above_ma10, price_above_ma20,
                             price_above_ma50, price_above_ma200)

    market_cap_b = load_market_cap_b(stock_dir)

    return {
        "stock":          symbol,
        "name":           meta.get("name", ""),
        "region":         meta.get("region", "US"),
        "universe":       meta.get("universe", ""),
        "sector":         meta.get("sector", ""),
        **roc_values,
        "score":          round(score, 2),
        **thresholds,
        **accel_values,
        "acceleration":   round(acceleration, 2),
        **crossovers,
        **rising_output,
        "ma10":           round(ma10,  2) if ma10  else None,
        "ma20":           round(ma20,  2) if ma20  else None,
        "ma50":           round(ma50,  2) if ma50  else None,
        "ma200":          round(ma200, 2) if ma200 else None,
        "price_above_ma10":  price_above_ma10,
        "price_above_ma20":  price_above_ma20,
        "price_above_ma50":  price_above_ma50,
        "price_above_ma200": price_above_ma200,
        "ma_trend":          ma_trend,
        "short_term_trend":  short_term_trend,
        "medium_term_trend": medium_term_trend,
        **ma_crossover_data,
        "roc_buy_trigger_date":     roc_trig_date,
        "roc_buy_trigger_days_ago": roc_trig_days,
        "roc_buy_trigger_price":    roc_trig_price,
        "ma_buy_trigger_date":      ma_trig_date,
        "ma_buy_trigger_days_ago":  ma_trig_days,
        "ma_buy_trigger_price":     ma_trig_price,
        "signal":         signal,
        "current_price":  round(current_price, 4),
        "latest_date":    dates[-1],
        "market_cap_b":   market_cap_b,   # USD billions
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not DATA_DIR.exists():
        print(f"✗ {DATA_DIR} does not exist. Run fetch_stock_data.py first.")
        return

    universe_meta = load_universe_meta()

    all_results = []
    errors      = []
    analyzed    = 0

    for stock_dir in sorted(DATA_DIR.iterdir()):
        if not stock_dir.is_dir():
            continue
        symbol   = stock_dir.name
        csv_path = stock_dir / f"{symbol}_historical_10y.csv"
        if not csv_path.exists():
            continue

        analyzed += 1
        meta = universe_meta.get(symbol, {})
        try:
            result = analyze_stock(symbol, csv_path, stock_dir, meta)
            if result:
                all_results.append(result)
        except Exception as e:
            errors.append(f"{symbol}: {e}")

    all_results.sort(key=lambda x: x["score"], reverse=True)

    total = len(all_results)
    for i, entry in enumerate(all_results):
        entry["rank"]       = i + 1
        entry["percentile"] = round((1 - i / total) * 100, 1) if total > 0 else 0

    signal_counts = {}
    for entry in all_results:
        sig = entry["signal"]
        signal_counts[sig] = signal_counts.get(sig, 0) + 1

    output = {
        "analysis":           "roc_momentum_us_v1",
        "market":             "US & Global (ADRs)",
        "roc_periods":        ROC_PERIODS,
        "score_weights":      SCORE_WEIGHTS,
        "accel_lookback":     ACCEL_LOOKBACK,
        "crossover_lookback": CROSSOVER_LOOKBACK,
        "ma_periods":         MA_PERIODS,
        "generated_at":       datetime.now().isoformat(),
        "stocks_analyzed":    analyzed,
        "stocks_with_data":   total,
        "signal_counts":      signal_counts,
        "data":               all_results,
    }

    with open(OUTPUT_FILE, "w") as f:
        json.dump(_sanitize(output), f, indent=2)

    print(f"\n✓ ROC Momentum analysis complete!")
    print(f"  Stocks analyzed  : {analyzed}")
    print(f"  Stocks with data : {total}")
    print(f"  Output           : {OUTPUT_FILE}")
    print(f"\n  Signal breakdown:")
    for sig in ["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"]:
        print(f"    {sig:12s} : {signal_counts.get(sig, 0)}")
    if all_results:
        print(f"\n  Top 10 by score:")
        for e in all_results[:10]:
            print(f"    #{e['rank']:>3d}  {e['stock']:<8s} [{e['region']:<12s}]  "
                  f"Score={e['score']:>7.2f}  {e['signal']}")
    if errors:
        print(f"\n  ⚠ {len(errors)} errors (showing first 5):")
        for err in errors[:5]:
            print(f"    - {err}")


if __name__ == "__main__":
    main()
