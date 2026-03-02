"""
fetch_universe.py
=================
Builds universe/universe_master.csv with columns:
  symbol, name, sector, region, universe, exchange

Sources:
  1. S&P 500   — Wikipedia (always current, no API key needed)
  2. Nasdaq 100 — Wikipedia
  3. Global ADRs — curated list of top foreign companies listed on US exchanges

Run once, or whenever you want to refresh the constituent list.
"""

import io
import requests
import pandas as pd
from pathlib import Path

OUT_DIR = Path(__file__).parent / "universe"
OUT_DIR.mkdir(exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


def read_html(url: str, **kwargs):
    """pd.read_html wrapper that passes browser User-Agent to avoid 403s."""
    html = requests.get(url, headers=HEADERS, timeout=30).text
    return pd.read_html(io.StringIO(html), **kwargs)


# ── S&P 500 ────────────────────────────────────────────────────────────────────

def fetch_sp500() -> pd.DataFrame:
    print("  Fetching S&P 500 from Wikipedia …")
    df = read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
    # Column names vary slightly — normalise
    df.columns = [c.strip() for c in df.columns]
    sym_col  = next((c for c in df.columns if "Symbol"   in c or "Ticker" in c), None)
    name_col = next((c for c in df.columns if "Security" in c or "Company" in c or "Name" in c), None)
    sec_col  = next((c for c in df.columns if "Sector"   in c), None)
    exch_col = next((c for c in df.columns if "Exchange" in c or "Exch" in c), None)

    df = df[[c for c in [sym_col, name_col, sec_col, exch_col] if c is not None]].copy()
    df.columns = ["symbol", "name", "sector", "exchange"][: len(df.columns)]
    for col in ["sector", "exchange"]:
        if col not in df.columns:
            df[col] = ""
    # yfinance uses BRK-B not BRK.B
    df["symbol"]   = df["symbol"].str.replace(".", "-", regex=False)
    df["region"]   = "US"
    df["universe"] = "SP500"
    df["exchange"]  = df["exchange"].fillna("NYSE")
    print(f"    → {len(df)} symbols")
    return df


# ── Nasdaq 100 ─────────────────────────────────────────────────────────────────

def fetch_nasdaq100() -> pd.DataFrame:
    print("  Fetching Nasdaq 100 from Wikipedia …")
    # Try multiple table indices — Wikipedia occasionally shifts tables
    tables = read_html("https://en.wikipedia.org/wiki/Nasdaq-100")
    ndx_df = None
    for i, t in enumerate(tables):
        if "Ticker" in t.columns or "ticker" in t.columns:
            ndx_df = t
            break
    if ndx_df is None:
        # Fallback: find table with a column containing known symbols
        for t in tables:
            flat = " ".join(str(c) for c in t.columns)
            if "Symbol" in flat or "Company" in flat:
                ndx_df = t
                break
    if ndx_df is None:
        print("    ⚠ Could not find Nasdaq 100 table — skipping")
        return pd.DataFrame(columns=["symbol","name","sector","exchange","region","universe"])

    # Normalise column names
    ndx_df.columns = [str(c).strip() for c in ndx_df.columns]
    sym_col  = next((c for c in ndx_df.columns if "ticker" in c.lower() or "symbol" in c.lower()), None)
    name_col = next((c for c in ndx_df.columns if "company" in c.lower() or "name" in c.lower()), None)
    if sym_col is None:
        print("    ⚠ Symbol column not found in Nasdaq 100 table — skipping")
        return pd.DataFrame(columns=["symbol","name","sector","exchange","region","universe"])

    df = ndx_df[[sym_col]].copy()
    df.columns = ["symbol"]
    df["name"]     = ndx_df[name_col].values if name_col else ""
    df["sector"]   = ""
    df["exchange"]  = "NASDAQ"
    df["region"]   = "US"
    df["universe"] = "NDX100"
    df["symbol"]   = df["symbol"].str.replace(".", "-", regex=False)
    df.dropna(subset=["symbol"], inplace=True)
    df = df[df["symbol"].str.len() > 0]
    print(f"    → {len(df)} symbols")
    return df


# ── Global ADRs / Foreign Listings ─────────────────────────────────────────────

GLOBAL_STOCKS = [
    # ── Europe ──────────────────────────────────────────────────────────────
    ("ASML",  "ASML Holding",              "Technology",        "Europe",       "NASDAQ"),
    ("SAP",   "SAP SE",                    "Technology",        "Europe",       "NYSE"),
    ("NVO",   "Novo Nordisk",              "Healthcare",        "Europe",       "NYSE"),
    ("SHEL",  "Shell PLC",                 "Energy",            "Europe",       "NYSE"),
    ("AZN",   "AstraZeneca",               "Healthcare",        "Europe",       "NASDAQ"),
    ("UL",    "Unilever",                  "Consumer Staples",  "Europe",       "NYSE"),
    ("HSBC",  "HSBC Holdings",             "Financials",        "Europe",       "NYSE"),
    ("TTE",   "TotalEnergies",             "Energy",            "Europe",       "NYSE"),
    ("SAN",   "Banco Santander",           "Financials",        "Europe",       "NYSE"),
    ("BTI",   "British American Tobacco",  "Consumer Staples",  "Europe",       "NYSE"),
    ("GSK",   "GSK plc",                   "Healthcare",        "Europe",       "NYSE"),
    ("BP",    "BP plc",                    "Energy",            "Europe",       "NYSE"),
    ("RDS-A", "Shell (legacy)",            "Energy",            "Europe",       "NYSE"),
    ("ORAN",  "Orange SA",                 "Communication",     "Europe",       "NYSE"),
    ("DB",    "Deutsche Bank",             "Financials",        "Europe",       "NYSE"),
    ("ING",   "ING Group",                 "Financials",        "Europe",       "NYSE"),
    ("PHG",   "Philips",                   "Healthcare",        "Europe",       "NYSE"),
    ("ERIC",  "Ericsson",                  "Technology",        "Europe",       "NASDAQ"),
    ("NOK",   "Nokia",                     "Technology",        "Europe",       "NYSE"),
    ("STM",   "STMicroelectronics",        "Technology",        "Europe",       "NYSE"),
    ("ENEL",  "Enel SpA",                  "Utilities",         "Europe",       "OTC"),
    ("ENI",   "Eni SpA",                   "Energy",            "Europe",       "NYSE"),
    ("LYG",   "Lloyds Banking Group",      "Financials",        "Europe",       "NYSE"),
    ("NWG",   "NatWest Group",             "Financials",        "Europe",       "NYSE"),
    ("CS",    "Credit Suisse",             "Financials",        "Europe",       "NYSE"),
    ("UBS",   "UBS Group",                 "Financials",        "Europe",       "NYSE"),
    ("ITOCY", "Itochu Corp",               "Industrials",       "Europe",       "OTC"),
    # ── China ────────────────────────────────────────────────────────────────
    ("BABA",  "Alibaba Group",             "Technology",        "China",        "NYSE"),
    ("JD",    "JD.com",                    "Consumer Disc",     "China",        "NASDAQ"),
    ("PDD",   "PDD Holdings",              "Consumer Disc",     "China",        "NASDAQ"),
    ("BIDU",  "Baidu",                     "Technology",        "China",        "NASDAQ"),
    ("NIO",   "NIO Inc",                   "Automotive",        "China",        "NYSE"),
    ("XPEV",  "XPeng",                     "Automotive",        "China",        "NYSE"),
    ("LI",    "Li Auto",                   "Automotive",        "China",        "NASDAQ"),
    ("NTES",  "NetEase",                   "Technology",        "China",        "NASDAQ"),
    ("TME",   "Tencent Music",             "Communication",     "China",        "NYSE"),
    ("VNET",  "VNET Group",                "Technology",        "China",        "NASDAQ"),
    ("IQ",    "iQIYI",                     "Communication",     "China",        "NASDAQ"),
    ("WB",    "Weibo",                     "Communication",     "China",        "NASDAQ"),
    ("YUMC",  "Yum China",                 "Consumer Disc",     "China",        "NYSE"),
    ("GDS",   "GDS Holdings",              "Technology",        "China",        "NASDAQ"),
    ("MPNGY", "Meituan",                   "Technology",        "China",        "OTC"),
    # ── Japan ────────────────────────────────────────────────────────────────
    ("TM",    "Toyota Motor",              "Automotive",        "Japan",        "NYSE"),
    ("HMC",   "Honda Motor",               "Automotive",        "Japan",        "NYSE"),
    ("SONY",  "Sony Group",                "Technology",        "Japan",        "NYSE"),
    ("NMR",   "Nomura Holdings",           "Financials",        "Japan",        "NYSE"),
    ("MFG",   "Mizuho Financial",          "Financials",        "Japan",        "NYSE"),
    ("MUFG",  "Mitsubishi UFJ Financial",  "Financials",        "Japan",        "NYSE"),
    ("SMFG",  "Sumitomo Mitsui Financial", "Financials",        "Japan",        "NYSE"),
    ("IX",    "ORIX Corporation",          "Financials",        "Japan",        "NYSE"),
    ("NTDOY", "Nintendo",                  "Technology",        "Japan",        "OTC"),
    ("FANUY", "Fanuc",                     "Industrials",       "Japan",        "OTC"),
    ("KYOCY", "Kyocera",                   "Technology",        "Japan",        "OTC"),
    ("TOSYY", "Toshiba",                   "Industrials",       "Japan",        "OTC"),
    # ── South Korea ──────────────────────────────────────────────────────────
    ("KB",    "KB Financial Group",        "Financials",        "South Korea",  "NYSE"),
    ("SHG",   "Shinhan Financial",         "Financials",        "South Korea",  "NYSE"),
    ("PKX",   "POSCO Holdings",            "Materials",         "South Korea",  "NYSE"),
    ("LPL",   "LG Display",                "Technology",        "South Korea",  "NYSE"),
    ("KEP",   "Korea Electric Power",      "Utilities",         "South Korea",  "NYSE"),
    ("SKM",   "SK Telecom",                "Communication",     "South Korea",  "NYSE"),
    ("KT",    "KT Corp",                   "Communication",     "South Korea",  "NYSE"),
    ("HDB",   "HDFC Bank",                 "Financials",        "India",        "NYSE"),
    # ── Latin America ────────────────────────────────────────────────────────
    ("MELI",  "MercadoLibre",              "Consumer Disc",     "Latin America","NASDAQ"),
    ("NU",    "Nu Holdings",               "Financials",        "Latin America","NYSE"),
    ("GLOB",  "Globant",                   "Technology",        "Latin America","NYSE"),
    ("VTEX",  "VTEX",                      "Technology",        "Latin America","NYSE"),
    ("STNE",  "StoneCo",                   "Financials",        "Latin America","NASDAQ"),
    ("PAGS",  "PagSeguro",                 "Financials",        "Latin America","NYSE"),
    ("ARCO",  "Arcos Dorados",             "Consumer Disc",     "Latin America","NYSE"),
    # ── Brazil ───────────────────────────────────────────────────────────────
    ("ITUB",  "Itau Unibanco",             "Financials",        "Brazil",       "NYSE"),
    ("VALE",  "Vale SA",                   "Materials",         "Brazil",       "NYSE"),
    ("PBR",   "Petrobras",                 "Energy",            "Brazil",       "NYSE"),
    ("ABEV",  "Ambev SA",                  "Consumer Staples",  "Brazil",       "NYSE"),
    ("BSBR",  "Banco Bradesco",            "Financials",        "Brazil",       "NYSE"),
    ("SBS",   "Cia de Saneamento Basico",  "Utilities",         "Brazil",       "NYSE"),
    ("ERJ",   "Embraer",                   "Industrials",       "Brazil",       "NYSE"),
    ("CIG",   "CEMIG",                     "Utilities",         "Brazil",       "NYSE"),
    # ── South Africa ─────────────────────────────────────────────────────────
    ("GOLD",  "Harmony Gold",              "Materials",         "South Africa", "NYSE"),
    ("AU",    "AngloGold Ashanti",         "Materials",         "South Africa", "NYSE"),
    ("GFI",   "Gold Fields",               "Materials",         "South Africa", "NYSE"),
    ("HL",    "Hecla Mining",              "Materials",         "South Africa", "NYSE"),
    ("MTN",   "MTN Group",                 "Communication",     "South Africa", "OTC"),
    # ── India ────────────────────────────────────────────────────────────────
    ("INFY",  "Infosys",                   "Technology",        "India",        "NYSE"),
    ("WIT",   "Wipro",                     "Technology",        "India",        "NYSE"),
    ("IBN",   "ICICI Bank",                "Financials",        "India",        "NYSE"),
    ("SIFY",  "Sify Technologies",         "Technology",        "India",        "NASDAQ"),
    ("RDY",   "Dr. Reddy's Laboratories",  "Healthcare",        "India",        "NYSE"),
    ("VEDL",  "Vedanta",                   "Materials",         "India",        "NYSE"),
    # ── Taiwan ───────────────────────────────────────────────────────────────
    ("TSM",   "Taiwan Semiconductor",      "Technology",        "Taiwan",       "NYSE"),
    ("UMC",   "United Microelectronics",   "Technology",        "Taiwan",       "NYSE"),
    ("ASX",   "ASE Technology",            "Technology",        "Taiwan",       "NYSE"),
    ("HIMX",  "Himax Technologies",        "Technology",        "Taiwan",       "NASDAQ"),
    # ── Australia ────────────────────────────────────────────────────────────
    ("BHP",   "BHP Group",                 "Materials",         "Australia",    "NYSE"),
    ("RIO",   "Rio Tinto",                 "Materials",         "Australia",    "NYSE"),
    ("WDS",   "Woodside Energy",           "Energy",            "Australia",    "NYSE"),
    # ── Canada ───────────────────────────────────────────────────────────────
    ("SHOP",  "Shopify",                   "Technology",        "Canada",       "NYSE"),
    ("CNI",   "Canadian National Railway", "Industrials",       "Canada",       "NYSE"),
    ("CP",    "Canadian Pacific Kansas City","Industrials",      "Canada",       "NYSE"),
    ("TRI",   "Thomson Reuters",           "Communication",     "Canada",       "NYSE"),
    ("ENB",   "Enbridge",                  "Energy",            "Canada",       "NYSE"),
    ("TRP",   "TC Energy",                 "Energy",            "Canada",       "NYSE"),
    ("SU",    "Suncor Energy",             "Energy",            "Canada",       "NYSE"),
    ("BBD-B", "Bombardier",               "Industrials",       "Canada",       "NYSE"),
    ("MFC",   "Manulife Financial",        "Financials",        "Canada",       "NYSE"),
    ("SLF",   "Sun Life Financial",        "Financials",        "Canada",       "NYSE"),
]


def fetch_global() -> pd.DataFrame:
    rows = []
    for sym, name, sector, region, exchange in GLOBAL_STOCKS:
        rows.append({
            "symbol":   sym,
            "name":     name,
            "sector":   sector,
            "exchange": exchange,
            "region":   region,
            "universe": "GLOBAL_ADR",
        })
    df = pd.DataFrame(rows)
    print(f"    → {len(df)} global ADR symbols")
    return df


# ── Build & save master ────────────────────────────────────────────────────────

def build_master():
    print("Building universe …")
    sp500   = fetch_sp500()
    ndx100  = fetch_nasdaq100()
    global_ = fetch_global()

    master = pd.concat([sp500, ndx100, global_], ignore_index=True)
    master.drop_duplicates(subset="symbol", keep="first", inplace=True)
    master.sort_values("symbol", inplace=True)
    master.reset_index(drop=True, inplace=True)

    out_path = OUT_DIR / "universe_master.csv"
    master.to_csv(out_path, index=False)

    print(f"\n✓ Universe built → {out_path}")
    print(f"  Total unique symbols : {len(master)}")
    print(f"\n  Breakdown by universe:")
    for u, cnt in master.groupby("universe")["symbol"].count().items():
        print(f"    {u:<12s}: {cnt}")
    print(f"\n  Breakdown by region (top 10):")
    for r, cnt in master.groupby("region")["symbol"].count().sort_values(ascending=False).head(10).items():
        print(f"    {r:<15s}: {cnt}")


if __name__ == "__main__":
    build_master()
