# Current Development Plan

## Status

The project is in Phase 4 module development. Market Data Provider Gateway phases 1 through 10 are complete, Provider-neutral Desktop IPC stages 1 through 10 are complete, the built-in strategies now run from normalized cached market bars, Super Chart UI/display optimization rounds 1 and 2 are complete, plugin package management is complete with third-party runtime execution paused for isolation, and the read-only Strategy Learning page plus Simplified Backtest MVP are complete.

Completed foundations:

- Electron desktop shell and preload bridge.
- React workstation routes and layout.
- AlphaFeed market data contract and secure credential persistence.
- LongBridge backup data source contract and secure credential persistence.
- Quote snapshot sync for the default watchlist.
- Local document-style market cache for quotes, watchlist, sync state, and bars.
- Chart workspace renders only real cached market bars in the production workspace; when no market data exists, the chart shows an explicit empty state instead of prototype candles.
- Provider verification, quote, and K-line network calls are registered behind main-process IPC handlers.
- Market K-line cache metadata, retention pruning, cache summary, and manual cleanup in Settings.
- Chart workspace exposes `realtime`, `1d`, and `1w`.
- `1d` chart rendering can merge the latest realtime quote snapshot into the current trading-day candle.
- `realtime` intraday chart can backfill 1m history through the provider gateway, normalize returned minute bars into the `realtime` cache, merge newer snapshots into canonical exchange-minute OHLC bars, and report delayed-history gaps.
- AlphaFeed REST polling batches the full watchlist every 10 seconds by default, reports provider health, latency, latest check time, error class, rate-limit retry hints, and keeps 30/60/120 second fallback controls.
- AlphaFeed WebSocket member-channel configuration is available in the API settings page, with stream credentials stored through the desktop secure credential bridge.
- AlphaFeed WebSocket quote streaming has a desktop IPC session, watchlist/all-symbol subscription payload, reconnect handling, permission/auth fallback states, normalized quote snapshots, and REST batch polling fallback in the chart workspace.
- Super chart first capability batch is in place: zoom, pan, right price-axis drag scaling, Beijing-time x-axis labels, price y-axis labels, real visible-range reset, OHLCV hover legend, explicit crosshair/grid/volume/price-label/current-price-line toggles, current price line and label, chart settings popover, context menu scaffold, and clearer strategy layer states.
- Built-in strategy runtime foundation and strategy render-layer contract.
- Pine-parity UTORB and Trend Targets implementations, including real session resets, Supertrend/WMA/EMA calculations, signals, targets, alerts, volume profile, and time-bounded chart overlays. Both built-in schemas retain the original Pine Script input defaults; parameter-sweep findings are research references rather than product defaults.
  - `chengzuopeng/stock-sdk` is the primary source for CN/HK/US quote snapshots. The Electron main process reinforces its historical and intraday bar path with the Tencent Finance route, so daily, weekly, and CN/HK current-session minute bars do not depend on Eastmoney. The gateway falls back in the order Stock SDK, AlphaFeed REST, LongBridge, then optional Yahoo Finance for supported US bars; it rejects a closed-session US Tencent single point instead of overwriting complete intraday history.
- Market Data Provider Gateway phase 1 is in place: provider IDs, capability declarations, health states, provider registry, and gateway fallback shell.
- Market Data Provider Gateway phase 2 is in place: AlphaFeed REST, AlphaFeed WebSocket, and LongBridge have compatibility providers that map existing bridge results into the provider-neutral gateway shape.
- Market Data Provider Gateway phase 3 is in place: cache and sync provider IDs now support legacy `alphafeed`/`longport` plus gateway IDs `stock-sdk`/`alphafeed-rest`/`alphafeed-websocket`/`longbridge`. Realtime intraday merge rules also preserve newer live bars from gateway live-capable providers.
- Market Data Provider Gateway phase 4 is in place: the chart workspace now reads historical bars, intraday bars, REST quote snapshots, and WebSocket quote snapshots through a chart-facing gateway adapter while preserving the existing visible AlphaFeed/LongBridge behavior.
- Market Data Provider Gateway phase 5 is in place: the API configuration page is provider-priority oriented, with `stock-sdk` default-expanded and shown as the enabled primary source; AlphaFeed REST, AlphaFeed WebSocket, and LongBridge remain collapsed fallback sections.
- Market Data Provider Gateway phase 6 is in place: the `stock-sdk` gateway adapter has an injectable operations boundary and tests for symbol normalization, quote/bar normalization, deterministic `open: 0` repair, invalid OHLC rejection, and fallback behavior.
  - Market Data Provider Gateway phase 7 is in place: `npm run probe:stock-sdk` runs real connectivity checks through the same Electron primary gateway route: Tencent Finance for Stock SDK historical/intraday bars plus Yahoo Finance fallback when US closed-session intraday history is unavailable. The current 10/10 report is documented in `docs/stock-sdk-data-test-report.md`.
- Market Data Provider Gateway phase 8 is in place: the chart gateway can register the real `stock-sdk` operations as the primary provider when `stockSdkPrimaryEnabled` is enabled in provider settings. The default setting is now on, users can still turn it off, and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge fallback paths remain active and covered by tests.
- Market Data Provider Gateway phase 9 is in place: the API configuration page exposes the guarded `stockSdkPrimaryEnabled` switch, provider priority status can show `stock-sdk` as enabled, and the chart status badge uses provider diagnostics to show active provider, health state, capability, and fallback source.
- API configuration now supports safe credential lifecycle actions for AlphaFeed REST, AlphaFeed WebSocket, and LongBridge: users can inspect only masked connection metadata, replace credentials through the existing verification flow, or delete the encrypted credential and its local binding record together.
- Market Data Provider Gateway phase 10 is in place: the gateway migration slice has passed final review, desktop tests, typecheck, production build, and the controlled `stock-sdk` probe. The final verified state is recorded as a git rollback point.
- Provider-neutral Desktop IPC stage 1 audit is complete: the chart still constructs gateway providers in renderer space, reads concrete provider credentials through `apiConfigService`, and can dynamically execute `stock-sdk` operations from the renderer gateway path.
- Provider-neutral Desktop IPC stage 2 contract is complete: `apps/desktop/src/electron/marketDataIpcContract.ts` defines typed `window.quantDesktop.marketData.*` request/response contracts, channel names, error codes, fallback metadata, provider status payloads, stream states, and the default provider priority. No runtime behavior has been switched yet.
- Provider-neutral Desktop IPC stage 3 shell is complete: `apps/desktop/src/electron/marketDataIpc.ts` registers provider-neutral shell handlers, `main.ts` registers them, `preload.ts` exposes `window.quantDesktop.marketData.*`, and `vite-env.d.ts` declares the renderer bridge types. The shell returns provider status plus structured unavailable errors until live provider wiring begins.
- Provider-neutral Desktop IPC stage 4 quote snapshot migration is complete: the main process builds the quote snapshot gateway from secure credential reads and provider adapters, and the chart's batch quote polling uses `window.quantDesktop.marketData.fetchQuoteSnapshot` when available. Historical bars, intraday bars, and WebSocket stream control remain on the previous paths for the next stages.
- Provider-neutral Desktop IPC stage 5 historical/intraday migration is complete: main-process market-data handlers now serve historical bars and intraday bars through the secure-credential-backed provider registry, and the chart's `realtime`, `1d`, and `1w` bar loading uses `window.quantDesktop.marketData.fetchHistoricalBars` or `fetchIntradayBars` when available.
- Provider-neutral Desktop IPC stage 6 WebSocket stream migration is complete: AlphaFeed WebSocket connect/read/disconnect now uses secure main-process credential reads and `window.quantDesktop.marketData.*` stream methods when available, while the legacy AlphaFeed stream bridge remains as a compatibility fallback.
- Provider-neutral Desktop IPC stage 7 chart renderer migration is complete: `ChartWorkspacePage` no longer reads provider credentials or constructs provider gateways directly. It uses a chart-facing market-data access layer that prefers `window.quantDesktop.marketData.*` and keeps the old gateway path only as a non-desktop compatibility fallback.
- Provider-neutral Desktop IPC stage 8 diagnostics hardening is complete: main-process provider status now reports registered provider health and capabilities, IPC tests cover provider status, fallback metadata, primary-provider failures, stream unauthorized/rate-limited states, and gateway diagnostics now return the latest failed-provider health after operation errors.
  - Provider-neutral Desktop IPC stage 9 final verification is complete. The later connectivity hardening update keeps the stage contracts intact while recording runtime-specific upstream availability separately from local typecheck and regression results.
- Provider-neutral Desktop IPC stage 10 final review is complete: the final audit confirmed the chart page no longer reads provider credentials or constructs concrete provider gateways, the legacy AlphaFeed/LongBridge bridges remain available, and the provider-neutral IPC bridge covers provider status, quotes, historical bars, intraday bars, and stream connect/read/disconnect.
- Strategy real-bar runtime slice is complete: UTORB and Trend Targets now run on normalized cached bars through `apps/desktop/src/features/strategies/chartStrategyRuntime.ts`; the chart and strategy management pages no longer rely on generated/sample strategy bars; parameter changes recompute strategy output; logs, signals, metrics, alerts, and render elements are exposed to the chart-facing layer.
- Super Chart UI/display optimization round 1 is complete: the chart workspace now uses a tighter chart-first layout, a collapsible right watchlist, a compact bottom status/tab dock, on-demand strategy configuration, first-pass layer controls, and candle-first price scaling so strategy overlays do not flatten the price view.
- Browser verification covered 1366x768, 1440x900, and 1920x1080. The chart workspace had no page-level vertical scroll, no button overflow, no blank chart state, and watchlist collapse reduced the right panel from 210px to 44px while expanding the chart area.
- Plugin package management MVP is complete: Electron main-process installation into a managed local directory, manifest and version validation, allow-listed strategy/indicator permissions, enable/disable/uninstall controls, typed preload IPC, and a local SMA crossover compatibility fixture. Third-party runtime execution is temporarily blocked at the IPC boundary because renderer imports are not a security sandbox; package source is not returned to the renderer while a Worker or utility-process host is designed.
- Simplified Backtest MVP is complete: Strategy Management now provides a compact backtest dialog that uses only normalized local bar cache, configures initial capital, one-way fee, one-way slippage, and optional short selling, then records deterministic next-bar-open entries, long/short reversals, terminal settlement, summaries, warnings, and a bounded local history of the latest 20 result snapshots. It does not make market-data requests, duplicate cached bars, or introduce live order execution.

## Desktop Hardening Update (2026-07-14)

- Third-party plugin source delivery to the renderer is blocked until an isolated runtime host exists. Installation and management remain available.
- The renderer can save or delete encrypted provider credentials but cannot read decrypted AlphaFeed or LongBridge secrets. Provider-neutral market-data IPC continues to use them inside the main process.
- Remote AlphaFeed REST, AlphaFeed WebSocket, and LongBridge endpoints require TLS; plaintext HTTP/WS remains available only for loopback development addresses.
- Electron renderer sandboxing and a restrictive Content Security Policy are enabled, and child-window creation is denied.
- Packaged desktop business data now falls back to persistent Chromium local storage instead of a preload-scoped in-memory store. Secure credentials remain in the main-process encrypted file store.
- Realtime chart snapshots update in memory on every tick while full bar-cache persistence is limited to once per chart context every 30 seconds.
- Non-login workstation routes load on demand to reduce initial renderer parsing; the login implementation itself was intentionally not changed.
- Root `npm run test` and `npm run check` commands plus a Windows GitHub Actions workflow now enforce tests, typecheck, renderer build, Electron build, and production dependency audit.

## Latest Stability Update (2026-07-11)

  - Completed market-data stability and intraday rendering performance slice. Quotes use Stock SDK first; CN/HK current-session intraday uses the Stock SDK Tencent timeline first; chart bars try Stock SDK first, then configured AlphaFeed REST and LongBridge, with Yahoo Finance as a US-only final emergency fallback. Quote snapshots skip Yahoo because it has no quote capability.
- Yahoo Finance is explicitly modeled as a US-only best-effort fallback for `1m`, `1d`, and `1w`, with bounded retry for transient network or HTTP 5xx failure. It does not claim websocket or guaranteed realtime capability.
- Provider-neutral error handling preserves the latest sanitized provider health detail. Stock SDK network failures now report a readable fallback-ready reason instead of only a generic request error.
- When a history or intraday request fails, the chart keeps any local bars already cached and reports the retained cache count. The cache-to-live merge rule still prevents historical data from overwriting newer live minute bars.
- Realtime rendering now samples only the render input above 1,200 points while retaining full cache and strategy input. Identical in-flight chart bar requests are deduplicated.
- Detailed source, capability limits, cache rules, and verification are recorded in `docs/market-data-stability-plan.md`.

## Runtime Governance Update (2026-07-13)

- Completed: market-data runtime event timeline, cache freshness evaluation, closed-market historical-cache reuse, retained-cache/error events, rate-limit/fallback/gap event categories, and Chinese diagnostics labels in the chart drawer.
- Completed: daily and weekly charts with a valid short historical series render from two bars onward; intraday retains its 30-point sparse-data protection.
- Confirmed: live refresh, strategy execution, chart viewport state, provider-neutral gateway contracts, and cache keys remain unchanged.
- Explicitly skipped for this milestone: AlphaFeed WebSocket real-protocol hardening and automated provider probe expansion.

## P0 Reliability And Data Quality Update (2026-07-13)

- Completed: the desktop renderer is protected by a global React error boundary. A route or component exception now presents a recoverable Chinese error screen with return-to-workspace and reload actions instead of leaving the application in an unresponsive black screen.
- Completed: browser `error` and `unhandledrejection` events are captured in a bounded local runtime record. Credential-like values are redacted before any user-facing toast or diagnostic record is created.
- Completed: one OHLCV quality rule now guards Stock SDK normalization, gateway conversion, local bar-cache writes, chart conversion, and the Stock SDK provider probe. Invalid timestamps/prices/volume/amounts and inconsistent OHLC bars are rejected before they can reach chart rendering or strategy input.
- Completed: the chart runtime event timeline records rejected upstream records as `行情数据异常`, retaining source/cache/fallback diagnostics without exposing credentials.
- Verification: `npm.cmd run test:desktop` (179 passing), `npm.cmd run test:strategy-engine` (35 passing), `npm.cmd run typecheck`, `npm.cmd run build`, and `npm.cmd run probe:stock-sdk` (10/10 passing) all succeeded.

## Strategy Learning Page Update (2026-07-13)

- Completed: a read-only `策略学习` navigation page explaining the current UTORB and Trend Targets strategies plus SMA, EMA, and BOLL indicators.
- Each entry covers core logic, markets/timeframes, parameter defaults, chart outputs, usage boundaries, and risk prompts.
- Intentionally excluded: cross-page navigation, learning records, review notes, progress tracking, AI explanation, and new market-data or strategy execution paths.

## Strategy and Backtest Update (2026-07-13)

- Completed: UTORB and Trend Targets run through the shared strategy engine with deterministic Pine-aligned calculations, chart render elements, alerts, metrics, and cached-bar backtest input.
- Completed: a reproducible 880-configuration parameter sweep is available through `npm.cmd run optimize:preset-strategies`; its current evidence and data-window limits are recorded in `docs/preset-strategy-parameter-optimization-report.md`.
- Decision: strategy schemas keep the original Pine defaults. The sweep candidates remain opt-in research settings because neither strategy showed stable profitability across every train, validation, and untouched test segment.
- Completed: UTORB chart levels now use time-bounded, semi-transparent dashed styling with distinct opening-range, upside-target, and downside-target colors. The original Pine visibility defaults for labels and volume profile remain enabled.
- Completed: the compact backtest defaults to long-only execution, while the dialog still exposes an explicit short-selling switch. Existing generic backtest execution does not yet model partial exits at UTORB/Trend Targets target levels.
- Known limitations: UTORB uses a fixed UTC offset and does not automatically switch US daylight saving time; TradingView dashboard/table placement and color-picker controls are represented by metrics or desktop chart styling rather than an exact UI clone.

## Trend Targets Realtime Parity Fix (2026-07-13)

- Fixed: realtime quote snapshots are assigned by provider `quoteTime` and update one canonical OHLC candle per exchange minute. Poll receive time is used only when quote time is invalid.
- Fixed: Trend Targets and other chart strategies always consume normalized minute candles on the `realtime` timeframe; switching the visual display between line and candlestick no longer changes strategy input granularity.
- Changed: intraday history requests now cover five weekday sessions with a 2,500-bar request budget. The realtime cache retains five market sessions and uses ten calendar days of storage retention so recursive Supertrend/WMA/EMA state has sufficient warmup context.
- Preserved: historical refresh cannot overwrite newer live minute bars, strategy parameters remain the original Pine defaults, and current-price snapshots remain independent from strategy signal state.
- Verification: desktop tests 181/181, strategy-engine tests 35/35, TypeScript typecheck, production build, and browser smoke verification all passed. Browser verification loaded 1,636 AAPL realtime minute bars, showed a non-degenerate latest OHLC candle, generated 29 Trend Targets render elements when enabled, and produced no console warnings or errors.
- Remaining parity boundary: exact TradingView equality still requires the upstream provider to return the same session, adjustment, exchange calendar, and in-progress minute data as TradingView. The current weekday window does not yet model exchange holidays.

## Windows Installer Build (2026-07-14)

- Completed: rebuilt the Electron desktop application and generated an x64 NSIS installer from commit `270a612`, including the canonical realtime minute-candle and Trend Targets input fix.
- Artifact: `release/quant-learning-desktop-2026-07-14/量化学习桌面版 Setup 0.1.0.exe`.
- Verification: desktop tests 181/181, strategy-engine tests 35/35, TypeScript typecheck, Electron main/preload/renderer production build, SHA-256 calculation, and unpacked executable startup smoke test all passed.
- Release limitations: the installer currently uses the default Electron icon and has no Authenticode publisher certificate. Windows may therefore show an unknown-publisher warning. The configured npm mirror does not implement the npm advisory endpoint, so `npm audit` could not complete for this build.
- Detailed artifact metadata, checksum, packaging command, installation behavior, and rollback reference are recorded in `docs/release-notes-2026-07-14.md`.

## Super Chart Loading Experience Update (2026-07-11)

- Sparse cache data no longer renders as a one-bar or one-segment temporary chart. `realtime` requires 30 points, `1d` requires 20 bars, and `1w` requires 12 bars before the chart canvas renders price, volume, indicators, and strategy layers.
- The chart retains its legend, toolbar, grid, price axis, and time axis while data is preparing. The canvas reports Chinese stages for cache reading, history synchronization, and strategy-layer preparation.
- Sufficient local cache renders immediately and refreshes remotely in the background. A failed refresh keeps usable cache visible and uses a non-blocking degraded state; an unusable cache shows a clear in-canvas error state instead of a misleading single bar.
- Opening the chart workspace warms the active symbol's remaining periods first, then warms every other watchlist symbol sequentially for `1d`, `1w`, and the recent intraday window. Cache freshness prevents unnecessary requests, identical requests remain deduplicated by the chart gateway, and effect cleanup stops subsequent background tasks on symbol/page changes.
- The watchlist now reports `已就绪`、`同步中`、`使用缓存`、`数据源降级`、or `加载失败` without exposing provider credentials.

## Current Data Flow

1. User binds AlphaFeed in the desktop app.
2. Optional LongBridge credentials can be entered as a backup source.
3. Initial sync creates the default watchlist.
4. Initial sync fetches quote snapshots.
5. Initial sync can warm cached bars, while the chart workspace can load active-symbol historical bars on demand.
6. Quote snapshots and K-line bars are written to local cache.
7. Chart workspace reads cached K-line bars by symbol, market, and timeframe.
8. The chart workspace uses a chart-facing market-data access layer for quote snapshots, historical bars, intraday bars, and AlphaFeed WebSocket stream control. In desktop mode this access layer calls `window.quantDesktop.marketData.*`; the old renderer-side gateway construction is isolated behind the access layer only for non-desktop compatibility.
9. If AlphaFeed WebSocket member credentials exist, the desktop main process opens the stream session first and normalizes incoming quotes into the same snapshot cache through the provider-neutral stream response.
10. If WebSocket is still connecting, disconnected, unauthorized, permission-denied, unconfigured, or has no first snapshot, the chart workspace keeps using AlphaFeed REST batch polling as fallback through the provider-neutral quote path.
11. AlphaFeed REST polling fetches the deduplicated watchlist in batches and keeps the latest quote snapshot per symbol.
12. On the `1d` chart, the active symbol quote is read from the snapshot cache and merged into the current trading-day candle.
13. On the `realtime` chart, the active symbol loads five weekday sessions of 1m history through `intradayBars` and normalizes returned bars into the `realtime` cache. During market hours, live quote snapshots update the matching exchange-minute OHLC candle; after close, polling stops and only historical intraday data remains.
14. If Stock SDK and configured credential-backed intraday providers cannot return US 1m history, the gateway uses a final Yahoo Finance emergency fallback. The returned bars keep `provider: "yahoo-finance"` metadata and the chart status explicitly reports the downgrade.
15. If LongBridge realtime-page history is delayed, the cache merge keeps newer live bars and the chart status explains whether the gap has been bridged.
16. Provider health is surfaced in the chart top bar with active provider, capability, fallback source, latency, latest check time, and degraded states.
17. Settings exposes cache size, indexed entries, retention cleanup, and full cache clearing.
18. Dashboard shows provider state, quote count, and K-line count.

## Planned Market Data Direction

The provider-gateway migration is complete. The next market-data architecture change is to move provider-neutral requests behind desktop IPC, not to introduce another direct provider swap.

Target priority:

1. `stock-sdk` primary source, default-on through `stockSdkPrimaryEnabled`.
2. Yahoo Finance US-only fallback for supported chart bars; it is not used for quote snapshots or WebSocket.
3. AlphaFeed REST fallback.
4. AlphaFeed WebSocket member-channel fallback for streaming quotes when available.
5. LongBridge fallback and broker/account integration path.

Important constraints:

- The current chart must keep rendering through the existing cache while provider-neutral IPC is introduced.
- Strategies must continue to depend only on normalized bars, not on provider SDKs.
- Existing AlphaFeed and LongBridge credentials and cache entries must remain readable.
- `stock-sdk` should not be marked as native WebSocket-capable until a real stream implementation exists. It should be modeled as REST plus optional polling-driven streaming.
- Provider-specific quirks must stay behind the desktop bridge and provider adapters.
- Renderer pages must stop constructing concrete provider gateways before the project is considered ready for packaging/security review.

## Next Tasks

### Recommended Next Slice: Super Chart Capability Completion Round 2

Status: ready.

Goal: build on the completed chart-first layout and finish the remaining chart workstation controls before moving into plugins, learning workflows, or packaging.

Recommended implementation slices:

1. Add richer provider diagnostics timeline: active provider, fallback events, rate-limit events, delayed-history events, latest update time, and data-gap explanations.
2. Expand indicator controls beyond the current moving average: at minimum moving average variants and a provider-neutral indicator render layer.
3. Improve drawing-tool scaffolding: UI state, selected tool, cancel/reset, and persisted command model placeholder; defer full drawing persistence.
4. Add explicit z-index ordering controls for strategy/indicator layers after the layer model is expanded beyond the current first-pass display.
5. Add browser smoke verification for the super chart with real cached bars, realtime intraday history, strategy layers, and provider status after each chart slice.

Acceptance:

- Existing `realtime`, `1d`, and `1w` chart behavior remains stable.
- The chart workspace keeps the TradingView-like information hierarchy: chart first, compact controls second, detailed settings only on demand.
- Chart content remains legible at normal desktop sizes without scrolling the main workstation.
- Strategy output continues to enter the chart only through declarative render elements.
- Provider diagnostics are understandable without exposing provider credentials.
- `npm run test:desktop`, `npm run typecheck`, and `npm run build` pass after the slice.

### Remaining Product Milestones

1. Market-data runtime stability: broaden automated provider probes, validate fallback behavior on mainland networks, and keep cache migration checks repeatable.
2. AlphaFeed WebSocket runtime hardening after exact member-channel protocol details are confirmed.
3. Plugin runtime isolation: Worker or utility-process host, capability messages, resource limits, signature verification, and permission consent history.
4. Optional backtest follow-up: date-range selection, equity curve, position sizing, and partial target/stop execution. The agreed simplified MVP is complete.
5. Desktop release readiness: product icon, Authenticode signing, update/rollback path, crash reporting, and installer regression checks.
6. Login and account flow redesign remains a separate future rewrite and is intentionally excluded from the current hardening slice.

### 0. Provider-Neutral Desktop IPC

Status: completed.

Goal: expose a provider-neutral desktop bridge at `window.quantDesktop.marketData.*` and move chart market-data requests out of renderer-side provider construction.

Acceptance:

- `window.quantDesktop.marketData.getProviderStatus`, `fetchQuoteSnapshot`, `fetchHistoricalBars`, `fetchIntradayBars`, `connectQuoteStream`, `readQuoteStreamSnapshot`, and `disconnectQuoteStream` exist behind typed IPC.
- Stock SDK remains the default primary provider, with AlphaFeed REST, AlphaFeed WebSocket, and LongBridge as fallback providers.
- Existing `window.quantDesktop.alphaFeed.*` and `window.quantDesktop.longPort.*` methods remain available as compatibility endpoints during migration.
- The chart page no longer reads provider credentials or constructs provider gateways after the migration completes.
- `realtime` history continues to use `intradayBars` and normalize returned minute bars into the `realtime` cache.
- Each stage updates documentation, passes `npm run typecheck`, receives review, and creates a rollback commit.

Recommended implementation slices:

1. Completed: add provider-neutral IPC contract types and channel names.
2. Completed: add `marketData` preload/main shell without changing chart behavior.
3. Completed: route quote snapshot requests through the new IPC.
4. Completed: route historical and intraday bar requests through the new IPC.
5. Completed: route AlphaFeed WebSocket stream control through the new IPC.
6. Completed: remove renderer-side gateway construction from the chart page.
7. Completed: add fallback, health, and error-diagnostics tests.
8. Completed: run final desktop tests, typecheck, build, and `probe:stock-sdk`.
9. Completed: final review, rollback commit, and completion audit.

### 1. Market Data Provider Gateway Planning

Status: completed.

Goal: introduce a provider-neutral market-data architecture before replacing the active provider flow.

Acceptance:

- Add or update documentation for `MarketDataProvider`, `MarketDataProviderRegistry`, `MarketDataGateway`, provider capabilities, health states, and failover order.
- Record `stock-sdk` smoke-test findings: CN/HK/US quote coverage, daily/intraday coverage, symbol conversion requirements, data-quality risks, and no confirmed native WebSocket support.
- Define cache-merge rules so older historical bars cannot overwrite newer live bars from any live-capable provider.
- Define an API configuration layout where `stock-sdk` is the primary source and AlphaFeed REST, AlphaFeed WebSocket, and LongBridge are fallback sections.
- Do not change production data fetching until the user confirms the gateway implementation step.

### 2. Market Data Provider Gateway Foundation

Status: completed. Phase 1 added the provider-neutral contracts and gateway/registry shell. Phase 2 wrapped existing AlphaFeed REST, AlphaFeed WebSocket, and LongBridge flows without changing chart behavior.

Goal: add the gateway and registry as a compatibility layer around the existing AlphaFeed and LongBridge flows.

Acceptance:

- Existing chart behavior stays unchanged.
- Existing cache stays readable.
- Typecheck passes after each slice.
- Renderer pages start moving toward provider-neutral gateway calls instead of direct provider-specific calls.

### 2.5. Market Data Provider Cache Compatibility

Status: completed.

Goal: extend cache and sync provider IDs so both legacy `alphafeed`/`longport` and gateway IDs `stock-sdk`/`alphafeed-rest`/`alphafeed-websocket`/`longbridge` can coexist safely.

Acceptance:

- Existing cache entries remain readable.
- New provider IDs can be sanitized, written, indexed, and reported.
- Historical refreshes still cannot overwrite newer live bars.
- Typecheck and desktop cache tests pass.

### 2.6. Chart Uses Market Data Gateway

Status: completed.

Goal: move chart data loading from direct AlphaFeed/LongBridge calls to the provider-neutral gateway while preserving the current visible chart behavior.

Acceptance:

- `realtime`, `1d`, and `1w` chart behavior remains unchanged.
- Existing cached data stays readable.
- Provider fallback order is visible in code and testable.
- Typecheck and desktop tests pass.
- Chart page no longer performs direct AlphaFeed/LongBridge network calls; provider-specific bridge calls are isolated behind `chartMarketDataGateway`.

### 2.7. API Configuration Uses Provider Priority

Status: completed.

Goal: redesign the API configuration page around the future provider priority model.

Acceptance:

- `stock-sdk` primary source is visible as the first, default-expanded placeholder and does not collect credentials yet.
- AlphaFeed REST, AlphaFeed WebSocket member channel, and LongBridge are visible as fallback provider sections and default collapsed.
- Provider priority is shown as `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, LongBridge.
- Existing AlphaFeed REST, AlphaFeed WebSocket, and LongBridge credential flows remain usable.
- Typecheck, desktop tests, and browser UI smoke verification pass.

### 2.8. stock-sdk Adapter Behind Gateway

Status: completed.

Goal: implement a provider-neutral `stock-sdk` adapter without switching production market-data traffic.

Acceptance:

- `stock-sdk` remains disabled by default and reports `unconfigured`, so the gateway can fall back to AlphaFeed/LongBridge without calling it.
- Adapter tests cover CN/HK/US symbol normalization for quotes and bars.
- Adapter tests cover quote snapshots, daily/weekly bars, intraday bars, deterministic zero-open repair, and invalid OHLC rejection.
- The app-facing symbol, market, provider, timeframe, and timestamp metadata are preserved on normalized records.
- Typecheck and desktop tests pass.

### 2.9. Controlled stock-sdk Data Test

Status: completed.

Goal: continuously verify the real `stock-sdk` primary route and its Electron fallback behavior against live market endpoints.

Acceptance:

- `stock-sdk@2.3.0` is pinned for the desktop primary provider and controlled probing.
- `npm run probe:stock-sdk` checks CN/HK/US quote snapshots, daily bars, weekly bars, and 1m intraday bars.
- Probe output is written to `docs/generated/stock-sdk-provider-probe-latest.json`.
- Human-readable findings are recorded in `docs/stock-sdk-data-test-report.md`.
- The probe uses the same Tencent historical route and Yahoo Finance fallback ordering as the production Electron gateway.

### 2.10. Guarded stock-sdk Primary Switch

Status: completed.

Goal: allow a controlled gray switch to try `stock-sdk` as the first provider while preserving existing fallback providers.

Acceptance:

- Provider settings default `stockSdkPrimaryEnabled` to `true`, while preserving an explicit user opt-out.
- The chart gateway registers `stock-sdk` only when the guarded setting is true or test config explicitly enables it.
- With the switch enabled, quote, historical, and intraday gateways try `stock-sdk` first.
- If `stock-sdk` is unavailable, quote fallback uses AlphaFeed REST, historical fallback uses LongBridge, and intraday fallback uses AlphaFeed REST then LongBridge.
- Tests prove the default-on primary source, explicit opt-out behavior, and fallback behavior.

### 2.11. Provider Diagnostics And Status Hardening

Status: completed.

Goal: make the multi-provider model visible to users and safer to operate during the guarded `stock-sdk` rollout.

Acceptance:

- The API configuration page exposes a UI-safe toggle for `stockSdkPrimaryEnabled`.
- Provider priority status can distinguish `stock-sdk` as `待接入` or `已启用`.
- The chart status badge can show whether realtime quotes, historical bars, or intraday bars were served by `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, or LongBridge.
- Fallback from a higher-priority provider is visible in the diagnostic message.
- Diagnostics remain in the app market-data feature layer; chart rendering and strategy packages still do not depend on provider SDKs.

### 2.12. Final Gateway Review And Verification

Status: completed.

Goal: close the Market Data Provider Gateway migration objective with an auditable final verification pass.

Acceptance:

- Re-check the final implementation against phases 1 through 9.
- Run the desktop test suite, full typecheck, production build, and controlled `stock-sdk` provider probe.
- Review the final diff for scope, provider fallback safety, credential handling, cache compatibility, and generated-file hygiene.
- Update current development, market-data provider, and execution plan documents.
- Commit the final verified state as a rollback point.

### 2.13. Realtime History Source Hotfix

Status: completed.

Goal: make the super chart `realtime` history use the same provider-neutral intraday source path as other data requests.

Acceptance:

- `realtime` history uses `intradayBars.fetchIntradayBars` instead of sending `1m` requests through `historicalBars`.
- Returned intraday bars are normalized into `timeframe: "realtime"` before cache merge.
- Stock SDK primary is default-on for new or malformed provider settings, while explicit user opt-out is preserved.
- Desktop tests and typecheck pass.

### 2.14. Stock SDK Tencent Historical Reinforcement

Status: completed.

Goal: keep `stock-sdk` as the product-level primary provider while avoiding its Eastmoney K-line route for normal desktop chart history.

Completion notes:

- Added the Electron-main-only Tencent Finance adapter at `apps/desktop/src/electron/tencentFinanceBars.ts`; renderer code never calls Tencent endpoints directly.
- Daily and weekly bars use Tencent `fqkline/get` for CN/HK/US. Default semantics are unadjusted; `forward` maps to `qfq` and `backward` maps to `hfq`.
- US history and intraday requests try `.OQ`, then `.NY` when the first result is empty; a successful exchange suffix is retained in process memory.
- Current-session minute data uses Tencent `minute/query`. CN 5m/15m/30m/1h uses `mkline`; HK/US higher periods aggregate valid 1-minute data.
- Closed-market US single-point minute replies are rejected, so they cannot overwrite a complete cached intraday series.
- Historical cache keys now include the adjustment mode. Existing unadjusted historical cache metadata is treated as legacy, deleted on first matching read, and then re-synced.
- Gateway bars, caches, and provider health can carry optional `upstream` metadata. Tencent-backed bars remain `provider: "stock-sdk"` and diagnostics report `Stock SDK · 腾讯财经`.
- Historical/intraday fallback order is Stock SDK, AlphaFeed REST, LongBridge, then Yahoo Finance for US-only emergency coverage.

Verification:

- Unit tests cover CN/HK/US history symbols, adjustment routing, US `.OQ/.NY` fallback, minute volume conversion, closed US sessions, Electron IPC wiring, upstream provenance, and cache adjustment isolation.
- Manual Tencent probes confirmed `1d` and `1w` for AAPL, 00700.HK, and 600519.SH; HK/CN `1m` and CN `5m` also returned data on the current network.

### 3. Super Chart Capability Completion

Status: complete for the agreed second-round scope.

Goal: complete the TradingView-like super chart as the unified surface for market data, indicators, strategy overlays, drawing tools, and future plugin layers.

Acceptance:

- Extend the chart toolbar, left drawing toolbar, chart settings entry, and right-click menu beyond the current safe scaffold.
- Surface market-data status, provider health, latency, latest update time, empty data, paused polling, and degraded API states.
- Keep the production chart empty when no real cached data exists; prototype/demo candles stay inside chart package fallback only.
- Use declarative render commands for strategy layers, indicator layers, and drawing layers instead of direct strategy-to-chart calls.
- Add z-index ordering and richer error detail for strategy layers.
- Add indicator-layer controls beyond the built-in moving average.
- Reserve interfaces for future multi-chart layout, synchronized crosshair, and synchronized zoom.

Deferred:

- Full TradingView Charting Library migration.
- Full multi-window synchronization.
- Advanced drawing tools such as Fibonacci, rectangles, and measurement overlays.
- Real order entry from chart context menu.

### 4. Mixed Provider Diagnostics

Status: complete for the current MVP. The compact provider-event timeline covers fallback, rate-limit, delayed-history, gap, cache, and rejected-data events.

Goal: make the multi-provider model visible and easier to debug.

Acceptance:

- Surface whether the current chart is using `stock-sdk REST`, `AlphaFeed REST`, `AlphaFeed WebSocket`, or `LongBridge`.
- Surface which provider served the current quote snapshot and each active bar batch.
- Add a compact provider-event timeline for repeated fallback, rate-limit, and delayed-history events.
- Keep broker/account integration behind desktop IPC.

### 5. AlphaFeed WebSocket Runtime Hardening

Goal: harden the initial AlphaFeed member-channel runtime after the user's real member plan and protocol details are confirmed.

Acceptance:

- Confirm the exact provider subscription payload and auth format against the user's plan.
- Add provider-specific heartbeat/ping handling if required.
- Add visible stream source diagnostics in the chart status surface.
- Add optional reconnect/backoff tuning if AlphaFeed publishes connection limits.

### 6. Strategy Uses Real Bars

Status: completed.

Goal: run built-in strategies on cached bars instead of generated chart data.

Acceptance:

- UTORB and Trend Targets run on cached bars.
- Parameter changes recompute layers.
- Strategy logs and signals update from real bar input.

Completion notes:

- The super chart converts `MarketDataBar` cache entries through `marketBarsToStrategyBars` before running strategies.
- `apps/desktop/src/features/strategies/chartStrategyRuntime.ts` is the chart-facing strategy runtime boundary. It accepts normalized bars, strategy settings, and registry references only; it does not depend on AlphaFeed, LongBridge, Stock SDK, or any provider implementation.
- The strategy management page now previews preset and draft strategies with cached AAPL realtime bars when available instead of hard-coded sample bars.
- `apps/desktop/tests/chart-strategy-runtime.test.ts` covers UTORB and Trend Targets running from the same normalized realtime bars, chart-facing signals/logs/render output, and parameter-driven recomputation.

## Deferred

- Real trading/order submission.
- Full Pine Script compiler.
- Full plugin sandbox and install UI.
- DuckDB migration for large-scale OHLCV storage.
