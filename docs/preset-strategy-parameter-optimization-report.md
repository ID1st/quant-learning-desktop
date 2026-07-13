# Preset strategy parameter optimization report

Date: 2026-07-13

## Conclusion

No tested configuration remained profitable across train, validation, and untouched test segments for every market regime. The configurations below are therefore the least fragile candidates found, not promises of future profit.

- Trend Targets: use the original slow parameters on `1d` bars with short selling disabled. Faster parameters looked excellent in the first four years but failed the untouched final year.
- UTORB: for the current US daylight-saving period, use `UTC-4`, a 45-minute candle-body opening range, and an ATR(7) × 2 trail with short selling disabled. It was positive in the recent test segment but slightly negative over the complete 60-day sample.

## Data and execution assumptions

- Data source: Yahoo Finance chart endpoint, regular US session only.
- Symbols: SPY, QQQ, AAPL, MSFT, NVDA, TSLA, JPM, XOM.
- Trend Targets: 1,255 daily bars per symbol, 2021-07-12 through 2026-07-10.
- UTORB: 4,681 five-minute bars per symbol, 2026-04-15 through 2026-07-10.
- Split: first 60% train, next 20% validation, final 20% untouched test.
- Capital: 100,000 per independent symbol run.
- Cost: 0.05% one-way fee plus 0.05% one-way slippage.
- Execution: signal on the current bar, fill at the next valid bar open.
- Search count: 320 Trend parameter sets and 120 timezone-correct UTORB parameter sets, each tested in long/short and long-only modes (880 parameter/mode configurations total).

Reported returns are the mean or median of eight independent symbol backtests, not a combined portfolio return.

## Trend Targets

### Recommended research configuration

| Setting | Value |
| --- | ---: |
| Timeframe | 1d |
| Supertrend factor | 12 |
| Supertrend ATR period | 90 |
| WMA length | 40 |
| EMA length | 14 |
| Allow short | Off |

The ATR stop and TP1/TP2/TP3 settings do not affect the current generic backtest order flow. They remain chart and alert references, so the search did not pretend to optimize them for return. Keep the Pine defaults (`ATR 14`, stop `5 ATR`, targets `0.5R / 1R / 1.5R`) until partial-exit execution is explicitly defined.

| Period | Mean return | Median return | Worst symbol | Mean max drawdown | Positive symbols | Trades | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full five years | 91.80% | 32.71% | 11.61% | 36.94% | 8 / 8 | 47 | 3.77 |
| Validation year | 6.67% | 7.44% | -3.66% | 7.85% | 6 / 8 | 9 | 3.93 |
| Untouched final year | -0.34% | 0.00% | -15.52% | 8.85% | 2 / 8 | 4 | 0.89 |

The faster `factor 12 / ATR 30 / WMA 20 / EMA 5` candidate was rejected: despite strong earlier results, its untouched final-year mean return was `-3.87%`, it made only three trades, and none won. The full-period mean is also heavily influenced by NVDA, so it is not sufficient evidence of robust alpha.

## UTORB

### Recommended paper-test configuration

| Setting | Value |
| --- | ---: |
| Timeframe | 5m |
| Session start | 09:30 New York |
| Timezone offset for this sample | UTC-4 |
| Opening range | 45 minutes |
| Range source | Candle body (`Close`) |
| Trailing stop | ATR(7) × 2 |
| Allow short | Off |

The timezone is data alignment, not a profit parameter. Use `UTC-4` during US daylight-saving time and `UTC-5` during standard time. The current application uses a fixed offset and does not switch automatically.

| Period | Mean return | Median return | Worst symbol | Mean max drawdown | Positive symbols | Trades | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Full 60 days | -0.26% | -1.57% | -6.69% | 6.66% | 3 / 8 | 263 | 0.98 |
| Train | 0.55% | -0.09% | -6.54% | 4.33% | 4 / 8 | 163 | 1.09 |
| Validation | -1.36% | -2.03% | -2.53% | 2.85% | 1 / 8 | 44 | 0.49 |
| Untouched recent test | 0.95% | 0.89% | -2.29% | 2.30% | 5 / 8 | 56 | 1.46 |

This configuration materially reduced the full-sample loss versus the default long/short setup (`-6.33%` mean return, `13.12%` mean drawdown), but it did not achieve stable profitability. It should remain in paper testing and should not be treated as production-ready.

## Reproduce

```powershell
npm.cmd run optimize:preset-strategies
```

The sweep script is `scripts/preset-strategy-parameter-sweep.mjs`. Results can change when the rolling Yahoo Finance 60-day intraday window advances.
