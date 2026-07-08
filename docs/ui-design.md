# UI Design Plan

## 1. Visual Target

Selected visual direction: **TradingView Pro Workbench**.

The UI should feel like a professional charting terminal:

- Dark theme first.
- Dense but readable.
- Chart-centric.
- Minimal decorative UI.
- Fast switching between symbols, timeframes, indicators, strategies, and logs.
- Familiar to TradingView users.

Avoid:

- Marketing landing page patterns.
- Oversized hero sections.
- Card-heavy dashboards.
- Decorative gradients, floating blobs, or ornamental surfaces.
- Cards inside cards.

## 2. Global Layout

```text
+--------------------------------------------------------------------------------+
| Logo | Symbol Search | Market | Timeframe | Indicators | Strategy | API | User |
+------+-------------------------------------------------------------------------+
|Tools |                                                                         |
|      |                         Super Chart                                     |
|      |              Candles + Volume + Strategy Overlays                       |
|      |                                                                         | Watchlist |
|      |                                                                         |----------|
|      |                                                                         | Details  |
|      |                                                                         |----------|
|      |                                                                         | Alerts   |
+------+-------------------------------------------------------------------------+----------+
| Strategy | Backtest | Orders | Logs | Console                                             |
+-------------------------------------------------------------------------------------------+
```

## 3. Navigation Model

Primary navigation:

- Dashboard
- Chart
- Strategies
- Backtest
- Learn
- Plugins
- Settings

In the chart workspace, navigation should not disrupt the chart context. Most workflows open as panels, side sheets, tabs, or bottom docks.

## 4. Login Page

```text
+--------------------------------------------------------------+
|                                                              |
|                 Quant Learning Desktop                       |
|                                                              |
|                 Email                                        |
|                 [________________________]                   |
|                                                              |
|                 Password                                     |
|                 [________________________]                   |
|                                                              |
|                 [ Login ]                                    |
|                                                              |
|                 Create account        Forgot password         |
|                                                              |
+--------------------------------------------------------------+
```

Interaction notes:

- Login validates email and password format locally.
- Submit calls cloud auth.
- Success checks whether LongPort API is bound.
- Failure shows clear, non-technical error.

## 5. Register Page

```text
+--------------------------------------------------------------+
| Create Account                                                |
|                                                              |
| Email                    [________________________]           |
| Password                 [________________________]           |
| Confirm Password         [________________________]           |
| Invite Code              [________________________]           |
| Email Code               [________] [Send Code]               |
|                                                              |
| [ Register ]                                                  |
|                                                              |
| Already have an account? Login                                |
+--------------------------------------------------------------+
```

Interaction notes:

- Invite code requires online verification.
- Email code requires send and verify actions.
- Password confirmation validates before network request.

## 6. First API Binding Page

```text
+----------------------------------------------------------------+
| Connect LongPort API                                            |
|                                                                |
| API URL        [________________________________________]       |
| API Key        [________________________________________]       |
| API Secret     [________________________________________]       |
|                                                                |
| Connection status: Not verified                                 |
|                                                                |
| [ Verify Connection ]                                           |
|                                                                |
| After verification, markets, watchlists, and K-line cache        |
| will sync automatically.                                        |
+----------------------------------------------------------------+
```

Interaction notes:

- API Secret is masked.
- Verification result shows provider error mapping.
- On success, credentials are stored encrypted.
- Initial sync starts automatically.

## 7. Dashboard

```text
+--------------------------------------------------------------------------------+
| Dashboard                                                                       |
+--------------------------------------------------------------------------------+
| Market Overview                  | Learning Progress                            |
| US / HK / A-share summary         | Current course, strategy lessons             |
+----------------------------------+---------------------------------------------+
| Recent Strategies                | Recent Backtests                             |
| UT ORB                           | Equity curve, win rate, drawdown             |
| Trend Targets                    |                                             |
+----------------------------------+---------------------------------------------+
| Sync Status                      | System Notices                               |
+--------------------------------------------------------------------------------+
```

Interaction notes:

- Dashboard is a launch surface, not a marketing page.
- Each area links into the chart workspace or strategy pages.

## 8. Super Chart Workspace

```text
+--------------------------------------------------------------------------------+
| QL | AAPL / 1D | US | 1m 5m 15m 1H 1D | Indicators | Strategy | Layout | API OK |
+----+---------------------------------------------------------------------------+
|    |                                                                         | |
| T  |                                                                         | W|
| o  |                         Candlestick Chart                               | a|
| o  |                         Volume Panel                                    | t|
| l  |                         Strategy Lines                                  | c|
| s  |                         Crosshair                                       | h|
|    |                                                                         | |
|    |                                                                         | |
+----+---------------------------------------------------------------------------+-+
| Strategy | Backtest | Orders | Logs | Console                                    |
| UT ORB running | signal list | metrics | latest logs                              |
+----------------------------------------------------------------------------------+
```

Interaction notes:

- Symbol search changes chart, watchlist detail, and strategy context.
- Timeframe switch reloads chart series and strategy outputs.
- Indicators menu opens a searchable indicator picker.
- Strategy button opens preset strategy selector and parameter panel.
- Bottom dock remembers selected tab.
- Right panel can collapse.
- Left tools support draw, trendline, horizontal line, measure, clear.

## 9. Right Watchlist Panel

```text
+-----------------------------+
| Watchlist        +           |
+-----------------------------+
| AAPL    201.20   +1.2%       |
| TSLA    322.10   -0.8%       |
| 00700   390.40   +0.3%       |
| 600519  1510.00  -1.1%       |
+-----------------------------+
| Details                     |
| Open / High / Low / Close   |
| Volume                      |
| Market session              |
+-----------------------------+
| Alerts                      |
| Price crossing              |
| Strategy signal             |
+-----------------------------+
```

## 10. Strategy Management Page

```text
+--------------------------------------------------------------------------------+
| Strategies                                                        [New Strategy] |
+--------------------------------------------------------------------------------+
| Built-in                                                                         |
| Ultimate Opening Range Breakout    preset    v1    enabled    [Configure] [Run] |
| Trend Targets                       preset    v1    enabled    [Configure] [Run] |
+--------------------------------------------------------------------------------+
| User Strategies                                                                  |
| Empty state or imported strategies                                               |
+--------------------------------------------------------------------------------+
| Plugin Strategies                                                                |
| Installed plugin strategies                                                      |
+--------------------------------------------------------------------------------+
```

Interaction notes:

- Built-in, user, and plugin strategies use the same strategy contract.
- Configure opens parameter editor.
- Run opens run mode selector: backtest, realtime, replay.

## 11. Strategy Parameter Panel

```text
+----------------------------------------------+
| Ultimate Opening Range Breakout               |
| Status: Ready                                  |
+----------------------------------------------+
| Session        [0930-1000]                     |
| Timezone       [UTC-5     v]                   |
| Source         [High/Low  v]                   |
| Extension      [Multiples v]                   |
| Mult 1         [1.0]                            |
| Mult 2         [2.0]                            |
| Mult 3         [3.0]                            |
| Show Trail     [ ]                              |
| ATR Length     [14]                             |
+----------------------------------------------+
| [Apply] [Run Backtest] [Start Realtime]        |
+----------------------------------------------+
```

## 12. Backtest Result Page

```text
+--------------------------------------------------------------------------------+
| Backtest: UT ORB / AAPL / 1D / 2023-2026                                        |
+--------------------------------------------------------------------------------+
| Equity Curve                                                                    |
+--------------------------------------------------------------------------------+
| Metrics                      | Trades                                           |
| Net PnL                      | Time | Side | Entry | Exit | Result              |
| Win Rate                     |                                                 |
| Max Drawdown                 |                                                 |
| Profit Factor                |                                                 |
+--------------------------------------------------------------------------------+
| Logs                                                                          |
+--------------------------------------------------------------------------------+
```

## 13. Plugin Management Page

```text
+--------------------------------------------------------------------------------+
| Plugins                                                        [Install Plugin] |
+--------------------------------------------------------------------------------+
| Strategy Plugins                                                               |
| Name | Version | Status | Permissions | Actions                                |
+--------------------------------------------------------------------------------+
| Indicator Plugins                                                              |
+--------------------------------------------------------------------------------+
| Data Source Plugins                                                            |
+--------------------------------------------------------------------------------+
| Export Plugins                                                                 |
+--------------------------------------------------------------------------------+
```

Interaction notes:

- Plugin install requires manifest validation.
- Disable is preferred over uninstall for troubleshooting.
- Permission changes require re-confirmation.

## 14. Settings Page

```text
+--------------------------------------------------------------------------------+
| Settings                                                                        |
+--------------------------------------------------------------------------------+
| Account       | Email, session, logout                                          |
| Security      | API credential status, redaction, device                        |
| Data Sources  | LongPort, future providers                                     |
| Cache         | SQLite/DuckDB path, clear cache                                 |
| Appearance    | Theme, density, chart colors                                    |
| Logs          | Log level, export diagnostics                                   |
+--------------------------------------------------------------------------------+
```

## 15. Visual System

Recommended design language:

- Base background: near-black graphite.
- Panel background: slightly lighter graphite.
- Dividers: subtle low-contrast lines.
- Accent colors:
  - Bull: green.
  - Bear: red.
  - Neutral/action: blue.
  - Warning: amber.
- Radius: small, typically 4-8px.
- Typography:
  - UI body: 14px.
  - Dense table text: 12-13px.
  - Panel title: 14-16px.
  - Avoid oversized headings in tool surfaces.

## 16. UI Acceptance Criteria

- Chart workspace is useful as the first screen after login and API binding.
- Text never overlaps in target desktop size.
- Main chart remains visually dominant.
- Strategy and learning features are visible but do not crowd the chart.
- Right and bottom panels can be collapsed.
- Built-in strategies are discoverable from both chart and strategy pages.

## 17. Super Chart UI Optimization Round 1

Status: completed.

Implemented:

- Chart-first layout with a tighter top toolbar and a fixed-height compact bottom dock.
- Right watchlist can collapse from the full panel to a narrow rail so the chart gains horizontal space.
- Bottom dock now uses a status strip plus tabs for Layers, Signals, and Logs instead of showing all panels at once.
- Strategy parameters remain available through the existing configuration dialog rather than occupying persistent workspace space.
- First-pass layer controls expose strategy enable, layer visibility, status, render element count, z-index display, and configuration entry.
- Chart price scaling is candle-first with padding, so distant strategy target lines do not flatten the main price movement.
- Browser smoke verification covered 1366x768, 1440x900, and 1920x1080 without page-level vertical scroll, button overflow, or blank chart state.

Remaining UI work:

- Provider diagnostics timeline.
- Indicator layer controls beyond the moving average.
- Drawing-tool state and command model placeholder.
- Explicit layer reordering controls once indicator and drawing layers join strategy layers.
