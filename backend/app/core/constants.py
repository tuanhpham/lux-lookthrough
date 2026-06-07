"""S&P 500 sector definitions and representative stock universes."""

# 11 GICS sectors with curated liquid constituents for prototype
SECTOR_STOCKS: dict[str, list[str]] = {
    "Technology": [
        "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "AMD", "QCOM", "TXN", "MU", "AMAT",
        "LRCX", "KLAC", "ADI", "MRVL", "NOW", "SNPS", "CDNS", "ANSS", "FTNT", "PANW",
    ],
    "Healthcare": [
        "LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY", "AMGN",
        "GILD", "ISRG", "SYK", "BSX", "MDT", "VRTX", "REGN", "ELV", "CI", "HUM",
    ],
    "Financials": [
        "BRK-B", "JPM", "BAC", "WFC", "GS", "MS", "BLK", "SCHW", "AXP", "SPGI",
        "CB", "PGR", "AON", "ICE", "CME", "MCO", "USB", "TFC", "PNC", "COF",
    ],
    "Consumer Discretionary": [
        "AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "TJX", "BKNG", "CMG",
        "ORLY", "AZO", "ROST", "YUM", "DHI", "LEN", "PHM", "NVR", "EBAY", "ETSY",
    ],
    "Communication Services": [
        "GOOGL", "META", "NFLX", "DIS", "CMCSA", "VZ", "T", "TMUS", "ATVI", "EA",
        "TTWO", "OMC", "IPG", "FOXA", "FOX", "WBD", "PARA", "NWSA", "NWS", "LYV",
    ],
    "Industrials": [
        "GE", "RTX", "HON", "UPS", "BA", "CAT", "DE", "LMT", "MMM", "GD",
        "NOC", "CSX", "UNP", "NSC", "FDX", "EMR", "ETN", "PH", "ROK", "ITW",
    ],
    "Consumer Staples": [
        "PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "MDLZ", "CL", "KMB",
        "GIS", "K", "CPB", "SJM", "HRL", "CAG", "MKC", "CHD", "CLX", "HSY",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "PXD", "OXY",
        "HAL", "BKR", "DVN", "FANG", "HES", "MRO", "APA", "EQT", "OKE", "WMB",
    ],
    "Utilities": [
        "NEE", "DUK", "SO", "D", "AEP", "EXC", "XEL", "SRE", "PCG", "ED",
        "ETR", "WEC", "ES", "DTE", "FE", "CMS", "CNP", "AES", "NI", "LNT",
    ],
    "Real Estate": [
        "AMT", "PLD", "CCI", "EQIX", "PSA", "O", "WELL", "DLR", "SPG", "AVB",
        "EQR", "MAA", "UDR", "ESS", "CPT", "NXR", "EXR", "CUBE", "NSA", "LSI",
    ],
    "Materials": [
        "LIN", "APD", "SHW", "FCX", "NEM", "NUE", "STLD", "RS", "ALB", "CE",
        "PPG", "ECL", "IFF", "DD", "EMN", "WRK", "IP", "PKG", "SEE", "AVY",
    ],
}

ALL_SECTORS = list(SECTOR_STOCKS.keys())
