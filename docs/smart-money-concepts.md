# Smart Money Concepts preset

## Purpose

`smart-money-concepts` is a default-disabled indicator preset. It is a
deterministic TypeScript translation of LuxAlgo's Smart Money Concepts Pine
indicator for local, non-commercial research.

Source: <https://www.tradingview.com/script/CnB3fSph-Smart-Money-Concepts-SMC-LuxAlgo/>

License: <https://creativecommons.org/licenses/by-nc-sa/4.0/>

The preset produces overlays, alerts, and event metrics. It does not fabricate
orders, returns, win rates, or backtest PnL.

## Data contract

- `bars` is the selected chart period. Realtime input is canonical,
  non-downsampled one-minute OHLCV.
- `seriesByTimeframe` may contain confirmed 5m, 15m, 30m, 1h, 1d, and 1w
  series. Monthly levels are aggregated from confirmed daily bars.
- A higher-timeframe bucket is not exposed until all expected lower-timeframe
  candles have closed.
- Previous-day/week/month levels only use periods that have closed before the
  last primary-bar timestamp.
- Fewer than 51 bars reports structure warm-up. Fewer than 200 bars preserves
  the Pine ATR(200) unavailable state and reports ATR warm-up.

## Implemented behavior

- Internal and swing pivots, BOS, CHoCH, HH/HL/LH/LL, and Strong/Weak High/Low
- Internal and swing order blocks, volatility filtering, mitigation, invalidation,
  and display limits
- EQH/EQL, two-part fair value gaps, and Premium/Equilibrium/Discount zones
- Previous daily, weekly, and monthly high/low levels
- Historical and Present modes
- Colored and Monochrome styles
- The original 16 alert categories

All pivot objects become actionable only at their confirmation bar. The engine
does not revise earlier signals using a future, unconfirmed pivot.

## Rendering contract

The strategy emits chart-independent primitives:

- swing order blocks and zones below candles;
- internal blocks and FVG below candles but above swing zones;
- candles;
- structure lines;
- EQH/EQL;
- labels and Strong/Weak levels.

Internal structure is dashed, swing structure is solid, and equal levels are
dotted. Structure labels are centered on the line. Strong/Weak and
previous-period labels anchor at the right plot edge. All coordinates use time
and price, so zooming, panning, and realtime appends do not convert objects into
screen-pixel annotations.

## Visual regression

Open the development-only fixture at:

`http://127.0.0.1:5174/?smc-visual-qa=1`

Run `node_modules/.bin/electron scripts/capture-smc-visual-qa.mjs` while the
Vite server is running. The script captures a 1984 × 842 Chromium frame and
writes the implementation and reference comparison into ignored `data/tmp/`
artifacts. See `design-qa.md` for the current acceptance record.
