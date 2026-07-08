# stock-sdk Controlled Data Test Report

## Scope

This report records the controlled Market Data Provider Gateway phase 7 test.

The test uses `stock-sdk@2.3.0` as a development-only dependency and routes real SDK responses through the disabled-by-default `stock-sdk` gateway adapter. It does not enable `stock-sdk` as the production chart provider.

## Test Command

```bash
npm run probe:stock-sdk
```

The latest machine-readable output is written to:

```text
docs/generated/stock-sdk-provider-probe-latest.json
```

## Latest Result

- Generated at: `2026-07-08T06:42:04.808Z`
- Package: `stock-sdk@2.3.0`
- Production impact: `not-enabled`
- Total checks: `10`
- Passed: `10`
- Failed: `0`

## Symbols

| Market | App Symbol | Provider Path |
| --- | --- | --- |
| CN | `600519.SH` | Quote, daily, weekly, 1m intraday |
| HK | `00700.HK` | Quote, daily, weekly, 1m intraday |
| US | `AAPL.US` | Quote, daily, weekly, 1m intraday |

## Coverage Summary

| Check | Result | Notes |
| --- | --- | --- |
| CN/HK/US quote snapshot | Passed | Normalized quote snapshots include price, previous close, open, high, low, volume, amount, and timestamp. |
| CN daily K-line | Passed | 5,956 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| CN weekly K-line | Passed | 1,254 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| CN 1m intraday | Passed | 1,188 rows, zero-open source rows are repaired at adapter boundary, no invalid OHLC rows after normalization. |
| HK daily K-line | Passed | 5,434 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| HK weekly K-line | Passed | 1,152 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| HK 1m intraday | Passed | 1,578 rows, zero-open source rows are repaired at adapter boundary, no invalid OHLC rows after normalization. |
| US daily K-line | Passed | 10,539 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| US weekly K-line | Passed | 2,184 rows, no zero-open rows after normalization, no invalid OHLC rows. |
| US 1m intraday | Passed | 1,955 rows, zero-open source rows are repaired at adapter boundary, no invalid OHLC rows after normalization. |

## Findings

- `stock-sdk` can provide usable REST coverage for CN/HK/US quote snapshots, daily K-lines, weekly K-lines, and 1m intraday bars for the tested symbols.
- The SDK returns valid full quote fields when using full quote endpoints, but some provider timestamps require tolerant parsing. Example: HK quote timestamps may be `null` while the `time` string is valid.
- Several 1m intraday feeds return `open: 0` for the first bar of a trading session. The adapter now repairs this deterministically by using the previous close only when it remains inside the current bar high/low range; otherwise it uses the current close.
- The controlled test confirms adapter-level normalization, but it does not yet prove production-grade rate-limit behavior, long-running polling stability, symbol coverage across a large watchlist, or native WebSocket support.

## Decision

The `stock-sdk` adapter is ready for a gray primary-source experiment behind the gateway, with AlphaFeed REST, AlphaFeed WebSocket, and LongBridge still retained as fallback providers.

Before making it the default production primary source, the next phase should add a guarded priority switch and visible provider diagnostics so the app can show when `stock-sdk` serves data and when fallback providers take over.
