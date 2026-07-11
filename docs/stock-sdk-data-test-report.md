# Stock SDK Connectivity Report

## Scope

`npm run probe:stock-sdk` invokes the same primary gateway route used behind Electron IPC: Stock SDK for quotes, Tencent Finance for historical/intraday bars, and Yahoo Finance only as the supported US intraday fallback. It does not call the legacy `sdk.kline.*` Eastmoney route.

## Latest Result: 2026-07-11

- Package: `stock-sdk@2.3.0`
- All 10 checks passed.
- CN/HK/US quote batches, daily K-lines, and weekly K-lines: passed through `stock-sdk` with Tencent Finance provenance.
- CN 1-minute current session: passed through Tencent Finance, 267 bars.
- HK 1-minute current session: passed through Tencent Finance, 332 bars.
- US 1-minute: Tencent returned only a closed-session single point, which the adapter correctly rejected; the gateway then loaded 1,951 valid Yahoo Finance fallback bars.

## Findings

- Tencent quote records can use exchange suffixes such as `AAPL.OQ`; the adapter now matches them to `AAPL.US`.
- Full CN quotes are used instead of `cnSimple`, because the simple response does not include the timestamp required by the normalized snapshot contract.
- The legacy Stock SDK K-line route may use Eastmoney infrastructure and is not used by production historical charts. Electron keeps Tencent endpoints behind a fixed, main-process-only route with request timeout, retry, concurrency, and symbol fallback controls.
- The application does not treat a closed-session US Tencent single point as complete intraday history. It preserves cache when present and otherwise falls back through the provider gateway.

## Verification Commands

```bash
npm run test:desktop -- --test-name-pattern "Stock SDK"
npm run typecheck
npm run probe:stock-sdk
```
