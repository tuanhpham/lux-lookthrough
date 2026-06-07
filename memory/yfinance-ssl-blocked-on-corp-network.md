---
name: yfinance-ssl-blocked-on-corp-network
description: yfinance/Yahoo calls fail with SSL CertificateVerifyError in this dev environment (corporate TLS interception)
metadata:
  type: project
---

In the lux-lookthrough (AMR) dev environment, every yfinance call (OHLCV history, `.info`, `income_stmt`) fails with `curl_cffi.requests.exceptions.CertificateVerifyError: SSL certificate problem: unable to get local issuer certificate`. This is corporate TLS interception (Allianz network), not a code bug — yfinance 1.4.1 uses curl_cffi which can't validate Yahoo's cert behind the proxy.

**Why:** Means you cannot smoke-test any live-data endpoint here; they all return empty/degraded. The app is written to degrade gracefully (empty candles/financials → "No data" in UI), so empty results in-sandbox are expected and NOT a regression.

**How to apply:** Verify data-parsing logic with synthetic DataFrames offline (e.g. test `_series_from_stmt` directly) rather than live calls. Real data works on the user's normal network. If live verification is ever needed, a fix would be setting a CA bundle / curl_cffi verify option, or pointing REQUESTS_CA_BUNDLE at the corp root cert.
