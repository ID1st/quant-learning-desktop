# Phase 2 UI Prototype

## Scope

This prototype is a visual and interaction prototype only. It does not implement authentication, LongPort API calls, market-data sync, chart engines, backtests, strategy conversion, plugin loading, or persistence.

## Visual Target

Selected direction: TradingView Pro Workbench.

Reference image:

`C:\Users\Admin\.codex\generated_images\019f09c6-4b9a-7fc0-bf91-95d5bc7483d0\ig_0de87542a1ce3631016a3ff5bf5ca08191927057b6bc632200.png`

Primary characteristics:

- Dark professional trading terminal.
- Top symbol search, timeframe selector, indicators, alerts, replay, strategy selector, publish action.
- Left chart drawing toolbar.
- Central chart-first workspace with quote strip, simulated K-line chart, smoother moving-average lines, volume bars, and buy/sell arrow signal markers.
- Right strategy configuration panel for preset strategy parameters.
- Far-right watchlist and selected-symbol details.
- Bottom strategy tester with metrics, equity curve, trade summary, and terminal-like tabs.
- Dense information layout with restrained borders, compact typography, and market-state colors.

## Prototype Location

- Source: `prototype/src/App.jsx`
- Styles: `prototype/src/styles.css`
- Built output: `prototype/dist/index.html`
- Package: `prototype/package.json`

The prototype uses React, Vite, and `lucide-react` for UI icons. It is intentionally isolated under `prototype/` so it does not become the formal application scaffold for Phase 3.

## Implemented Screens And Regions

### Trading Workbench

- Top trading toolbar.
- Symbol search field.
- Timeframe selector.
- Chart tool actions.
- Strategy selector and publish button.
- Left drawing toolbar.
- Central chart surface.
- Buy/sell arrow markers after strategy signals.
- Smooth visual overlays for moving averages and signal trail.
- Right strategy settings panel.
- Watchlist panel.
- Symbol detail card.
- Bottom strategy tester.
- Status bar.

### Strategy Prototype States

- Preset strategy list includes:
  - Ultimate Opening Range Breakout.
  - Trend Targets.
  - ML Price Target Signals.
- UORB is selected by default.
- Parameter controls are visually populated with mock values.
- Checkboxes and tab buttons are interactive UI controls only.

### Market Prototype States

- Watchlist includes US, HK, and A-share symbols as mock rows.
- Selecting a watchlist row updates the selected symbol details.
- Quote coloring uses green/red market-state styling.

### Bottom Panel

- Strategy, Backtest, Orders, and Logs tabs are clickable.
- Backtest tab is selected by default.
- Metrics, equity curve, trade summary, and terminal tabs are filled with realistic mock data.

## Responsive Behavior

- Desktop: three-column trading workspace with chart, strategy panel, and watchlist.
- Medium width: strategy panel collapses out of the main grid to preserve chart readability.
- Mobile/narrow width: chart-first single-column flow with panel toggle controls.

## Non-Goals

- No real candlestick engine.
- No TradingView or Lightweight Charts integration.
- No Pine Script parsing or strategy execution.
- No API validation.
- No login/register workflow implementation.
- No database reads or writes.
- No plugin loading.

## Phase 2 Acceptance Criteria

- UI prototype can be built locally with `npm.cmd run build`.
- Prototype source remains isolated under `prototype/`.
- No business logic or trading execution logic is introduced.
- UI follows the selected TradingView-like direction.
- Key panels and controls are visible and populated with realistic mock content.
- Known verification limitations are recorded in `design-qa.md`.

## Run Instructions

From `prototype/`:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run dev -- --port 5173
```

Open:

```text
http://127.0.0.1:5173
```

If PowerShell blocks `npm`, use `npm.cmd` rather than `npm`.
