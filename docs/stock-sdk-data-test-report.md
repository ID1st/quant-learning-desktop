# Stock SDK Connectivity Report

## Scope

`npm run probe:stock-sdk` invokes the production Stock SDK adapter, not a duplicate probe-only adapter. The result therefore reflects the same normalization and fallback behavior used behind Electron IPC.

## Latest Result: 2026-07-11

- Package: `stock-sdk@2.3.0`
- Quote batch: CN/HK/US passed.
- CN 1-minute current session: passed through Tencent timeline, 267 bars.
- HK 1-minute current session: passed through Tencent timeline, 332 bars.
- CN/HK/US daily and weekly K-lines: unavailable in the current network.
- US 1-minute Stock SDK K-line: unavailable in the current network; the application now routes US bar requests to Yahoo Finance first.

## Findings

- Tencent quote records can use exchange suffixes such as `AAPL.OQ`; the adapter now matches them to `AAPL.US`.
- Full CN quotes are used instead of `cnSimple`, because the simple response does not include the timestamp required by the normalized snapshot contract.
- Stock SDK K-line requests route to Eastmoney infrastructure. Current requests fail with `fetch failed` or an 8-second timeout, while Tencent quote and timeline endpoints remain reachable.
- The application does not fabricate multi-day K-lines from a current-session timeline. CN/HK daily and weekly charts require a reachable Stock SDK K-line upstream or a verified AlphaFeed/LongBridge fallback.

## Verification Commands

```bash
npm run test:desktop -- --test-name-pattern "Stock SDK"
npm run typecheck
npm run probe:stock-sdk
```
