# Stock SDK Connectivity Report

## Scope

`npm run probe:stock-sdk` invokes the same primary gateway route used behind Electron IPC: Stock SDK for quotes, Tencent Finance for historical/intraday bars, and Yahoo Finance only as the supported US intraday fallback. It does not call the legacy `sdk.kline.*` Eastmoney route.

## Latest Result: 2026-07-15

- Package: `stock-sdk@2.3.0`
- All 10 checks passed.
- CN/HK/US quote batches, daily K-lines, and weekly K-lines passed through `stock-sdk` with Tencent Finance provenance.
- CN/HK current-session 1-minute data passed through Tencent Finance. US 1-minute data used the supported Yahoo Finance emergency fallback because Tencent returned only a closed-session single point.
- The probe now records provider/upstream, latency, freshness, row count, completeness, continuity, normalized OHLCV quality, and a classified error kind for every check. This run reported 8 delayed checks, which is informational for closed or non-trading sessions rather than a failed request.

## Findings

- Tencent quote records can use exchange suffixes such as `AAPL.OQ`; the adapter now matches them to `AAPL.US`.
- Full CN quotes are used instead of `cnSimple`, because the simple response does not include the timestamp required by the normalized snapshot contract.
- The legacy Stock SDK K-line route may use Eastmoney infrastructure and is not used by production historical charts. Electron keeps Tencent endpoints behind a fixed, main-process-only route with request timeout, retry, concurrency, and symbol fallback controls.
- The application does not treat a closed-session US Tencent single point as complete intraday history. It preserves cache when present and otherwise falls back through the provider gateway.
- Historical series are considered complete only with at least 60 daily bars or 26 weekly bars. A daily gap over 14 days or weekly gap over 35 days is classified as discontinuous, so sparse or cross-year malformed rows cannot silently become chart/cache data.
- The generated machine-readable report is `docs/generated/stock-sdk-provider-probe-latest.json`. It is a current-network observation, not a promise of real-time data or upstream availability.

## Verification Commands

```bash
npm run test:desktop -- --test-name-pattern "Stock SDK"
npm run typecheck
npm run probe:stock-sdk
```
