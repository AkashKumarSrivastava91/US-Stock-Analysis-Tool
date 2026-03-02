"""
fetch_stock_data.py
===================
For each symbol in universe/universe_master.csv:
  1. Fetch 10y daily OHLCV  → stocks_data/{SYMBOL}/{SYMBOL}_historical_10y.csv
  2. Fetch fundamentals     → stocks_data/{SYMBOL}/{SYMBOL}.json

Designed to be incremental: symbols already fetched today are skipped.
Run daily after US market close (4 PM ET = 21:00 UTC).
"""

import json
import math
import time
import random
import traceback
from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf

# ── Configuration ──────────────────────────────────────────────────────────────
DATA_DIR   = Path(__file__).parent / "stocks_data"
UNIV_FILE  = Path(__file__).parent / "universe" / "universe_master.csv"
RATE_SLEEP = (0.3, 0.8)   # seconds between API calls (be polite to Yahoo)
MAX_RETRY  = 3

DATA_DIR.mkdir(exist_ok=True)


def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None so json.dump produces valid JSON."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


# ── Fetch single symbol ────────────────────────────────────────────────────────

def fetch_symbol(symbol: str, meta: dict) -> bool:
    sym_dir = DATA_DIR / symbol
    sym_dir.mkdir(exist_ok=True)

    ticker = yf.Ticker(symbol)

    # ── 1. OHLCV (10 years, daily) ──────────────────────────────────────────
    for attempt in range(MAX_RETRY):
        try:
            hist = ticker.history(period="10y", interval="1d", auto_adjust=True)
            if hist.empty:
                print(f"  ✗ {symbol}: empty history")
                return False

            # Strip timezone from index so CSV is clean
            hist.index = hist.index.tz_localize(None) if hist.index.tz is not None else hist.index
            hist.reset_index(inplace=True)

            # Keep only OHLCV columns
            keep = [c for c in ["Date", "Open", "High", "Low", "Close", "Volume"] if c in hist.columns]
            hist[keep].to_csv(sym_dir / f"{symbol}_historical_10y.csv", index=False)
            break
        except Exception as e:
            if attempt == MAX_RETRY - 1:
                print(f"  ✗ {symbol}: OHLCV failed after {MAX_RETRY} attempts — {e}")
                return False
            time.sleep(2 ** attempt)

    # ── 2. Fundamentals ─────────────────────────────────────────────────────
    try:
        info = ticker.info
        fundamentals = {
            "symbol":          symbol,
            "name":            info.get("longName") or meta.get("name", ""),
            "sector":          info.get("sector")   or meta.get("sector", ""),
            "industry":        info.get("industry", ""),
            "country":         info.get("country")  or meta.get("region", ""),
            "region":          meta.get("region", ""),
            "universe":        meta.get("universe", ""),
            "currency":        info.get("currency", "USD"),
            "exchange":        info.get("exchange")  or meta.get("exchange", ""),
            "market_cap":      info.get("marketCap"),            # raw USD value
            "pe_ratio":        info.get("trailingPE"),
            "forward_pe":      info.get("forwardPE"),
            "pb_ratio":        info.get("priceToBook"),
            "dividend_yield":  info.get("dividendYield"),
            "52_week_high":    info.get("fiftyTwoWeekHigh"),
            "52_week_low":     info.get("fiftyTwoWeekLow"),
            "avg_volume_10d":  info.get("averageVolume10days"),
            "avg_volume_3m":   info.get("averageVolume"),
            "fetched_at":      str(date.today()),
        }
        with open(sym_dir / f"{symbol}.json", "w") as fh:
            json.dump(_sanitize(fundamentals), fh, indent=2)
    except Exception as e:
        # Non-fatal — OHLCV alone is enough for analysis
        print(f"  ⚠ {symbol}: fundamentals failed — {e}")

    time.sleep(random.uniform(*RATE_SLEEP))
    return True


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not UNIV_FILE.exists():
        print(f"✗ Universe file not found: {UNIV_FILE}")
        print("  Run fetch_universe.py first.")
        return

    universe = pd.read_csv(UNIV_FILE)
    symbols  = universe["symbol"].tolist()
    meta_map = universe.set_index("symbol").to_dict("index")

    print(f"US Stock Data Fetcher")
    print(f"  Universe : {UNIV_FILE.name}  ({len(symbols)} symbols)")
    print(f"  Output   : {DATA_DIR}")
    print(f"  Date     : {date.today()}")
    print()

    ok, skipped, failed = 0, 0, 0
    today = date.today()

    for i, symbol in enumerate(symbols):
        csv_path = DATA_DIR / symbol / f"{symbol}_historical_10y.csv"

        # Skip if fetched today already
        if csv_path.exists():
            mod_date = date.fromtimestamp(csv_path.stat().st_mtime)
            if mod_date >= today:
                skipped += 1
                continue

        print(f"  [{i+1:4d}/{len(symbols)}] {symbol:<10s}", end=" ", flush=True)
        try:
            if fetch_symbol(symbol, meta_map.get(symbol, {})):
                print("✓")
                ok += 1
            else:
                print("✗  (no data)")
                failed += 1
        except Exception as exc:
            print(f"✗  ERROR: {exc}")
            traceback.print_exc()
            failed += 1

    print(f"\n✓ Done.")
    print(f"  Fetched  : {ok}")
    print(f"  Skipped  : {skipped}  (already up-to-date)")
    print(f"  Failed   : {failed}")


if __name__ == "__main__":
    main()
