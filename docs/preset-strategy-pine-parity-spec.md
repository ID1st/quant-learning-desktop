# Spec: Built-in Pine strategy parity

## Objective

Make the built-in `trend-targets` and `utorb` strategies calculate the signal-driving and chart-visible behavior defined by the Pine sources in `trading-strategies/`. The desktop chart must receive real baseline, session, extension, target, stop, rejection, and breakout elements rather than placeholder approximations.

## Commands

- Strategy tests: `npm.cmd run test:strategy-engine`
- Desktop integration tests: `npm.cmd run test:desktop`
- Type check: `npm.cmd run typecheck`
- Build: `npm.cmd run build`
- Dev verification: `npm.cmd run dev`

## Project Structure

- `trading-strategies/`: authoritative Pine behavior.
- `packages/strategy-engine/src/index.ts`: built-in strategy calculations and output contracts.
- `packages/strategy-engine/tests/`: Pine-parity unit tests.
- `packages/chart/src/index.tsx`: chart rendering of strategy elements.
- `apps/desktop/src/pages/ChartWorkspacePage.tsx`: parameter controls and chart-layer integration.

## Code Style

Use deterministic, side-effect-free series calculations and explicit state transitions:

```ts
const baseline = ema(wma(supertrendMidpoint, wmaLength), emaLength);
const turnedBullish = previousSlope <= 0 && currentSlope > 0;
```

Keep parameter fallbacks next to strategy entry points and keep Pine-specific calculations inside the strategy engine.

## Pine-to-runtime mapping

### Trend Targets

- `ta.atr` -> Wilder RMA true-range series.
- `pine_supertrend` -> recursively clamped lower/upper bands.
- `ta.wma` then `ta.ema` -> plotted trend baseline.
- baseline slope crossings -> persistent trend state and buy/sell turn signals.
- consecutive baseline rejections -> neutral chart markers and alert signals after `confirmationCount`.
- latest trend turn -> entry, ATR stop, TP1/TP2/TP3 lines and risk/target zones.
- Pine close/level crossing conditions -> alert messages and setup crossing metrics.

### UTORB

- session/timezone/day inputs -> per-session opening-range state, including a hard reset at each local trading day.
- High/Low or candle-body source -> opening-range high/low.
- Multiples or Fibonacci -> three upper and lower extensions.
- close crossover/crossunder after the session -> at most one signal per direction per session, with high/low-volume label.
- ATR trail -> persistent long/short trail series and exit marker when crossed.
- target hits -> per-session and aggregate hit-rate metrics.
- opening-session volume buckets -> chart volume-profile bars represented through strategy range elements.
- New York close, London close, manual time, or end-of-day -> time-bounded chart overlays in the configured fixed timezone.
- TradingView dashboard values -> strategy metrics/logs; platform-specific table position, label size, and color-picker UI are not reproduced.

## Testing Strategy

- Unit tests use deterministic OHLCV fixtures and assert exact series points, session resets, signal timestamps, target levels, rejection markers, and parameter sensitivity.
- Desktop integration tests assert both strategies pass their complete chart elements through the existing runtime.
- Browser verification should confirm the chart renders the new elements with no console errors when the local browser environment permits localhost navigation.

## Boundaries

- Always: preserve existing strategy keys and chart-layer contracts; validate numeric and session parameters; keep calculations deterministic.
- Ask first: add dependencies, change persisted strategy keys, or change the generic backtest execution model.
- Never: execute Pine dynamically, put strategy calculations in React, or claim parity for TradingView-only table/color APIs.

## Success Criteria

- Trend Targets output changes when each signal-driving Pine parameter changes and its baseline is the Supertrend-midpoint WMA/EMA series.
- UTORB supports multiple daily sessions, correct timezone windows, all six extension levels, one breakout per direction per session, volume classification, trail output, and hit-rate metrics.
- Both outputs render through the desktop chart without a strategy-specific React calculation.
- Strategy tests, desktop tests, type checking, build, and browser verification pass.

## Open Questions

None. The repository Pine files are the behavior source; TradingView-only presentation is mapped to existing desktop chart primitives and metrics.
