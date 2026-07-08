# Market Data Provider Plan

## Current Decision

The system currently uses a split provider model:

- AlphaFeed REST and optional AlphaFeed WebSocket provide same-day quote updates.
- LongBridge provides historical K-line and intraday-history backfill.
- LongBridge also remains the broker/account integration path for future trading workflows.

The next decision is to introduce a provider-neutral market-data gateway before changing production traffic. `chengzuopeng/stock-sdk` is a candidate primary provider, while AlphaFeed REST, AlphaFeed WebSocket, and LongBridge should become fallback providers after the gateway is in place.

This document is a design and migration plan. The `stock-sdk` adapter exists behind the provider gateway and is enabled by default through the guarded local `stockSdkPrimaryEnabled` switch. Users can still turn it off, and AlphaFeed REST/WebSocket plus LongBridge continue to protect production chart behavior as fallback providers.

## Candidate Primary Provider: stock-sdk

Source:

- GitHub: `https://github.com/chengzuopeng/stock-sdk`
- Tested npm version: `stock-sdk@2.3.0`
- Tested repository commit: `e0d8aca`, dated 2026-07-07
- License reported by npm: ISC
- Runtime dependency profile reported by npm package metadata: no runtime dependencies

Smoke-test findings:

- CN quote works when using provider-compatible symbols such as `sh600519`.
- HK quote works with symbols such as `00700`.
- US quote works with symbols such as `AAPL`.
- CN daily K-line works with `adjust: ""`; default or incorrect adjustment can produce unsuitable historical values for our chart.
- HK daily K-line works with `adjust: ""`.
- US daily K-line requires Eastmoney-style secid symbols such as `105.AAPL`; plain `AAPL` returned empty data in the smoke test.
- CN 1-minute intraday data works, but early rows may contain `open: 0`, so normalization must repair or reject invalid open values.
- HK 1-minute intraday data works.
- US 1-minute intraday data works when using `105.AAPL`.
- The controlled phase 7 probe passed 10/10 checks for `600519.SH`, `00700.HK`, and `AAPL.US` quote, daily, weekly, and 1m intraday data through the gateway adapter. See `docs/stock-sdk-data-test-report.md`.
- No native WebSocket or SSE client was found in the source search. Treat `stock-sdk` as REST-capable, not WebSocket-capable, until proven otherwise.

Implications:

- `stock-sdk` is promising as a primary REST source for quotes, historical bars, and intraday bars.
- It must sit behind our own adapter, symbol normalizer, response validator, and provider health mapper.
- The app must not expose `stock-sdk` implementation details to chart, strategy, cache, or UI modules.
- AlphaFeed WebSocket remains useful as a fallback streaming channel because `stock-sdk` does not currently satisfy native WebSocket needs.

## Target Provider Priority

Default priority after migration:

1. `stock-sdk` primary provider.
2. `alphafeed-rest` fallback provider.
3. `alphafeed-websocket` fallback streaming provider.
4. `longbridge` fallback provider and future broker integration provider.

The priority should eventually be configurable, but the first implementation should keep a fixed order to reduce risk.

## Provider Boundary

Provider-specific code must stay behind typed boundaries.

Renderer pages must not call external APIs directly. They should call `MarketDataGateway` or a narrow desktop bridge method that delegates to gateway/provider adapters.

The current direct bridge methods remain supported during migration:

- `window.quantDesktop.alphaFeed.verifyCredentials`
- `window.quantDesktop.alphaFeed.fetchQuoteSnapshot`
- `window.quantDesktop.alphaFeed.fetchHistoricalBars`
- `window.quantDesktop.alphaFeed.fetchIntradayBars`
- `window.quantDesktop.alphaFeed.connectStream`
- `window.quantDesktop.alphaFeed.readStreamSnapshot`
- `window.quantDesktop.alphaFeed.disconnectStream`
- `window.quantDesktop.longPort.verifyCredentials`
- `window.quantDesktop.longPort.fetchQuoteSnapshot`
- `window.quantDesktop.longPort.fetchHistoricalBars`

The target bridge should add provider-neutral methods after the gateway exists:

- `window.quantDesktop.marketData.getProviderStatus`
- `window.quantDesktop.marketData.verifyProvider`
- `window.quantDesktop.marketData.fetchQuoteSnapshot`
- `window.quantDesktop.marketData.fetchHistoricalBars`
- `window.quantDesktop.marketData.fetchIntradayBars`
- `window.quantDesktop.marketData.connectStream`
- `window.quantDesktop.marketData.readStreamSnapshot`
- `window.quantDesktop.marketData.disconnectStream`

## Target Contracts

```ts
type MarketDataProviderId =
  | "stock-sdk"
  | "alphafeed-rest"
  | "alphafeed-websocket"
  | "longbridge";

type ProviderHealthStatus =
  | "unconfigured"
  | "healthy"
  | "degraded"
  | "unavailable"
  | "unauthorized"
  | "rateLimited"
  | "delayed";

type ProviderDelayLevel = "realtime" | "delayed" | "unknown";

interface ProviderRateLimit {
  requestsPerSecond?: number;
  batchSize?: number;
  retryAfterMs?: number;
}

interface ProviderCapability {
  realtimeQuote: boolean;
  historicalBars: boolean;
  intradayBars: boolean;
  websocket: boolean;
  batchQuote: boolean;
  markets: Array<"US" | "HK" | "CN">;
  timeframes: Array<"realtime" | "1d" | "1w">;
  rateLimit?: ProviderRateLimit;
  delayLevel: ProviderDelayLevel;
}

interface ProviderHealthStatusView {
  provider: MarketDataProviderId;
  status: ProviderHealthStatus;
  message: string;
  checkedAt: string;
  latencyMs?: number;
  nextRetryAt?: string;
  capability: ProviderCapability;
}

interface MarketDataProvider {
  id: MarketDataProviderId;
  displayName: string;
  capability: ProviderCapability;
  getHealth(): Promise<ProviderHealthStatusView>;
}

interface RealtimeQuoteProvider extends MarketDataProvider {
  fetchQuoteSnapshot(items: MarketDataRequestItem[]): Promise<MarketQuoteSnapshot[]>;
}

interface HistoricalBarProvider extends MarketDataProvider {
  fetchHistoricalBars(request: MarketBarRequest): Promise<MarketDataBar[]>;
}

interface IntradayBarProvider extends MarketDataProvider {
  fetchIntradayBars(request: MarketBarRequest): Promise<MarketDataBar[]>;
}

interface StreamingQuoteProvider extends MarketDataProvider {
  connectStream(request: MarketDataStreamRequest): Promise<ProviderHealthStatusView>;
  readStreamSnapshot(): Promise<MarketQuoteSnapshot[]>;
  disconnectStream(): Promise<ProviderHealthStatusView>;
}

interface MarketDataProviderRegistry {
  register(provider: MarketDataProvider): void;
  list(): MarketDataProvider[];
  listByCapability(capability: keyof ProviderCapability): MarketDataProvider[];
  get(id: MarketDataProviderId): MarketDataProvider | undefined;
}

interface MarketDataGateway {
  fetchQuoteSnapshot(items: MarketDataRequestItem[]): Promise<MarketDataGatewayResult<MarketQuoteSnapshot[]>>;
  fetchHistoricalBars(request: MarketBarRequest): Promise<MarketDataGatewayResult<MarketDataBar[]>>;
  fetchIntradayBars(request: MarketBarRequest): Promise<MarketDataGatewayResult<MarketDataBar[]>>;
}
```

Shared normalized quote snapshot:

```ts
interface MarketQuoteSnapshot {
  symbol: string;
  market: "CN" | "US" | "HK";
  lastPrice: number;
  previousClose: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  changePercent: number;
  volume: number;
  amount?: number;
  quoteTime: string;
  receivedAt: string;
  provider: MarketDataProviderId;
}
```

Shared normalized market bar:

```ts
interface MarketDataBar {
  symbol: string;
  market: "CN" | "US" | "HK";
  timeframe: "realtime" | "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1w";
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
  provider: MarketDataProviderId;
}
```

## Merge And Cache Policy

Cache keys should continue to be normalized by market, symbol, and timeframe so the chart can read one coherent series.

Each bar still carries provider metadata. During the gateway migration, metadata should be extended to describe mixed-provider cache entries:

- `providers`: providers present in the cached series.
- `latestProvider`: provider for the latest bar.
- `sourceSegments`: optional future metadata for provider ranges.

Merge rules:

1. Sort by timestamp.
2. For identical timestamps, prefer the result from the higher-priority provider unless the existing bar has a newer `receivedAt` or a live-source marker.
3. Historical refreshes must not delete live bars newer than the latest historical timestamp.
4. Data with invalid OHLC values should be repaired only when the rule is deterministic. Example: for `stock-sdk` intraday rows with `open: 0`, use the row close or previous close as open only inside the provider adapter and record the provider as `stock-sdk`.
5. Do not fabricate missing intermediate bars between delayed history and realtime data. Surface the gap as a provider health or chart status state.

## Symbol Normalization Policy

The app-facing symbol format should remain stable:

- US: `AAPL.US`
- HK: `00700.HK` or current five-digit HK symbols.
- CN: `600519.SH`, `000001.SZ`.

Provider adapters map app symbols to provider symbols:

- `stock-sdk` CN quote: `600519.SH` -> `sh600519`, `000001.SZ` -> `sz000001`.
- `stock-sdk` CN K-line: `600519.SH` -> `600519`.
- `stock-sdk` HK: `00700.HK` -> `00700`.
- `stock-sdk` US quote: `AAPL.US` -> `AAPL`.
- `stock-sdk` US K-line and minute: `AAPL.US` -> `105.AAPL` when Eastmoney secid is required.

The exact US secid mapping must be tested and isolated in the adapter before production use.

## API Configuration Page Plan

The API configuration page should become provider-priority oriented.

Sections:

1. Primary market source
   - Default expanded.
   - Label: `Stock SDK 主行情源`.
   - Current state: placeholder until implementation.
   - Shows capability badges: CN/HK/US, quote, daily K-line, weekly K-line, intraday, REST polling.
   - Shows no native WebSocket badge until verified.

2. Fallback data sources
   - AlphaFeed REST.
   - AlphaFeed WebSocket member channel.
   - LongBridge.
   - Default collapsed; click to expand configuration.

3. Provider priority
   - Fixed initial order: stock-sdk, AlphaFeed REST, AlphaFeed WebSocket, LongBridge.
   - Future UI can allow reordering after gateway stability is proven.

4. Provider status
   - `unconfigured`
   - `configured`
   - `verifying`
   - `healthy`
   - `unauthorized`
   - `unavailable`
   - `rateLimited`
   - `delayed`
   - `degraded`

## Migration Plan

### Step 1: Documentation And Contract Planning

Status: completed.

Scope:

- Update docs with target provider architecture and `stock-sdk` feasibility results.
- No production code changes.

Acceptance:

- Plan documents describe provider priority, target contracts, cache merge rules, API settings layout, risks, and test plan.

### Step 2: Gateway Foundation

Status: completed. The provider-neutral type contracts, registry, and fallback gateway shell have been added in `apps/desktop/src/features/marketData/marketDataProviderGateway.ts`, with unit coverage in `apps/desktop/tests/market-data-provider-gateway.test.ts`. AlphaFeed REST, AlphaFeed WebSocket, and LongBridge compatibility providers have been added in `apps/desktop/src/features/marketData/marketDataCompatibilityProviders.ts`, with unit coverage in `apps/desktop/tests/market-data-compatibility-providers.test.ts`. Existing production data fetching has not been switched yet.

Scope:

- Add provider-neutral types, registry, and gateway shell.
- Register existing AlphaFeed and LongBridge adapters through compatibility wrappers.
- Keep current chart behavior unchanged.

Acceptance:

- `npm run typecheck` passes.
- Existing desktop tests pass.
- Existing chart can still read current cache.
- Gateway compatibility providers map legacy provider IDs into `alphafeed-rest`, `alphafeed-websocket`, and `longbridge` without changing legacy bridge result contracts.

### Step 3: Cache Compatibility

Status: completed. Provider IDs have been centralized in `apps/desktop/src/features/marketData/marketDataProviderIds.ts`. Market sync state, quote snapshot cache, K-line cache bars, and K-line cache metadata now accept legacy `alphafeed`/`longport` plus gateway IDs `stock-sdk`/`alphafeed-rest`/`alphafeed-websocket`/`longbridge`.

Scope:

- Extend provider IDs while keeping legacy `alphafeed` and `longport` cache entries readable.
- Add mixed-provider metadata without changing the cache key format.

Acceptance:

- Old cache entries remain readable.
- New provider IDs can be sanitized and written.
- Tests cover legacy and new provider IDs.
- Realtime intraday merge rules preserve newer live bars from `alphafeed`, `alphafeed-rest`, `alphafeed-websocket`, and `stock-sdk`.

### Step 4: Chart Uses Gateway

Status: completed. The chart workspace now uses `apps/desktop/src/features/marketData/chartMarketDataGateway.ts` to create provider-neutral gateways for LongBridge historical bars, AlphaFeed intraday bars, AlphaFeed REST quote polling, and AlphaFeed WebSocket quote snapshots. The visible chart behavior is preserved: historical chart loading still prefers LongBridge, REST polling still prefers AlphaFeed REST, and WebSocket remains an optional first stream path with REST fallback.

Scope:

- Move chart data loading from direct provider-specific calls to `MarketDataGateway`.
- Preserve current AlphaFeed and LongBridge behavior first.

Acceptance:

- `realtime`, `1d`, and `1w` charts still render as before.
- No provider-specific network calls remain directly in chart page logic except transitional credential reads if needed.
- Gateway quote/bar conversions preserve `previousClose`, open/high/low, amount, provider, market, symbol, timeframe, and timestamp metadata needed by current chart merges.

### Step 5: API Configuration Redesign

Status: completed. The API configuration page now shows `stock-sdk` as the default-expanded primary placeholder, keeps AlphaFeed REST, AlphaFeed WebSocket member channel, and LongBridge as collapsed fallback sections, and displays the fixed provider priority plus current stored-binding status.

Scope:

- Update the configuration page to show primary provider placeholder and fallback provider sections.
- Do not make `stock-sdk` the live source yet.

Acceptance:

- Existing AlphaFeed and LongBridge credential flows remain usable.
- New provider status and priority layout is visible.
- `stock-sdk` does not collect credentials and is not used for production data fetching yet.

### Step 6: stock-sdk Adapter Behind Gateway

Status: completed. The adapter has been added in `apps/desktop/src/features/marketData/stockSdkGatewayProvider.ts` with unit coverage in `apps/desktop/tests/stock-sdk-gateway-provider.test.ts`. It uses an injectable operations boundary, so the app does not need to import or call the real SDK until the controlled data-test phase. By default it reports `unconfigured`, which lets the gateway fall back to existing providers without calling `stock-sdk`.

Scope:

- Add the adapter after the gateway is stable.
- Implement quote, historical bar, and intraday bar normalization.
- Keep it feature-flagged or disabled until tests pass.

Acceptance:

- Unit tests cover CN/HK/US quote normalization.
- Unit tests cover daily/intraday bar normalization.
- Tests cover CN `open: 0` repair/rejection and US secid mapping.
- Provider health maps network, empty, invalid response, rate-limit, and delayed states.

### Step 7: Controlled stock-sdk Data Test

Status: completed. `stock-sdk@2.3.0` is pinned as a root development-only dependency, and `npm run probe:stock-sdk` runs a manual real-data probe through the disabled gateway adapter. The latest run passed all 10 checks and wrote `docs/generated/stock-sdk-provider-probe-latest.json`. A human-readable summary is kept in `docs/stock-sdk-data-test-report.md`.

Scope:

- Install or dynamically load the real `stock-sdk` package in a controlled adapter test path.
- Test CN/HK/US quotes, daily bars, weekly bars, and intraday bars against known symbols.
- Record latency, empty responses, invalid OHLC rows, provider delay behavior, and rate-limit behavior.
- Keep production chart priority unchanged while tests run.

Acceptance:

- Real data tests produce a repeatable report for CN/HK/US coverage.
- Any data-quality repairs stay inside the `stock-sdk` adapter.
- No real `stock-sdk` request path is enabled in the chart until the test report is accepted.
- If tests fail, AlphaFeed REST/WebSocket and LongBridge remain unaffected.

### Step 8: Controlled Primary Switch

Status: completed. The chart-facing gateway now supports a guarded `stockSdkPrimaryEnabled` provider setting. The default setting is on, while an explicit user opt-out remains supported. When enabled, `stock-sdk` is registered as the first quote, historical bar, and intraday bar provider, while AlphaFeed REST, AlphaFeed WebSocket, and LongBridge remain fallback providers.

Scope:

- Make `stock-sdk` the primary provider.
- Keep AlphaFeed REST/WebSocket and LongBridge fallback paths.

Acceptance:

- If `stock-sdk` returns empty or invalid data, the gateway falls back without breaking the chart.
- Provider diagnostics clearly show the active provider.
- Strategies still run only on normalized cached bars.

Implemented acceptance:

- `stock-sdk` primary source is guarded by `stockSdkPrimaryEnabled` and is on by default for new or malformed settings.
- The chart gateway can use real `stock-sdk` operations when enabled.
- Tests cover default legacy priorities, enabled stock-first priorities, and fallback to AlphaFeed/LongBridge when `stock-sdk` is unavailable.
- Full visible provider diagnostics are intentionally carried into Step 9.

### Step 8.5: Realtime History Path Correction

Status: completed.

Scope:

- Route super-chart `realtime` history through `intradayBars.fetchIntradayBars` instead of `historicalBars.fetchHistoricalBars`.
- Normalize returned `1m` intraday gateway bars into `timeframe: "realtime"` before writing the chart cache.
- Keep `1d` and `1w` loading on `historicalBars.fetchHistoricalBars`.
- Keep AlphaFeed REST, AlphaFeed WebSocket, and LongBridge fallback behavior intact.

Acceptance:

- `stock-sdk` can serve `realtime` history through the intraday gateway path.
- LongBridge remains able to backfill realtime history through its compatibility provider.
- Realtime cache merge receives `timeframe: "realtime"` bars and no longer drops `1m` gateway bars.
- Desktop tests and typecheck pass.

### Step 9: Provider Diagnostics And Status Hardening

Status: completed. The app now has a provider-diagnostics formatter in `apps/desktop/src/features/marketData/marketDataProviderDiagnostics.ts`, chart status messages include active provider/capability/fallback information, and the API configuration page exposes the guarded Stock SDK primary-source switch.

Scope:

- Surface active provider, fallback provider, latest provider health, and reason for fallback in the chart status area.
- Clarify user-facing messages for `unconfigured`, `unauthorized`, `rateLimited`, `delayed`, `degraded`, and `unavailable` states.
- Add a UI-safe way to toggle the guarded `stock-sdk` primary switch.
- Keep provider-specific details out of strategy and chart rendering packages.

Acceptance:

- Users can see whether data came from `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, or LongBridge.
- Fallback events are visible without breaking chart rendering.
- Provider settings and diagnostics are documented.

Implemented acceptance:

- `stockSdkPrimaryEnabled` can be toggled from the API configuration page and persists through provider settings.
- Provider priority status can show `stock-sdk` as `待接入` or `已启用`.
- Chart status diagnostics summarize provider label, capability, health status, latency/check time, and fallback source.
- Unit tests cover provider labels, status labels, fallback summaries, and the guarded primary status.

### Step 10: Final Review, Verification, And Rollback Point

Status: completed.

Scope:

- Re-audit phases 1 through 9 against the original Market Data Provider Gateway objective.
- Run final desktop tests, full typecheck, production build, and controlled `stock-sdk` provider probe.
- Review provider fallback safety, credential boundaries, cache compatibility, and generated-file hygiene.
- Commit the final verified state as a rollback point.

Acceptance:

- AlphaFeed REST, AlphaFeed WebSocket, and LongBridge remain fallback providers.
- `stock-sdk` remains guarded behind `stockSdkPrimaryEnabled`.
- Existing chart behavior, cache behavior, and strategy behavior remain protected by tests.
- Typecheck, desktop tests, build, and provider probes pass.

### Step 11: Provider-Neutral Desktop IPC

Status: stage 9 final verification completed; final review and rollback commit pending.

Scope:

- Add `window.quantDesktop.marketData.*` methods that delegate to the provider gateway in the main process.
- Keep existing AlphaFeed and LongBridge bridge methods as compatibility endpoints until the provider-neutral IPC path is stable.
- Move renderer pages closer to provider-neutral requests and away from credential-aware provider construction.
- Move provider selection, secure credential reads, fallback order, health classification, and concrete provider operations to the desktop boundary.

Current audit findings:

- `apps/desktop/src/electron/preload.ts` exposes `window.quantDesktop.alphaFeed.*` and `window.quantDesktop.longPort.*`, but does not yet expose `window.quantDesktop.marketData.*`.
- `apps/desktop/src/electron/providerDataIpcContract.ts` and `apps/desktop/src/electron/providerDataIpc.ts` are provider-specific compatibility IPC layers. They require renderer-side callers to pass AlphaFeed or LongBridge credentials.
- `apps/desktop/src/pages/ChartWorkspacePage.tsx` reads saved AlphaFeed, AlphaFeed WebSocket, and LongBridge credentials from `apiConfigService`, then constructs `createChartMarketDataGateways` inside the renderer.
- `apps/desktop/src/features/marketData/chartMarketDataGateway.ts` registers `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, and LongBridge providers in renderer space. It already uses the provider-neutral gateway contracts, but the construction boundary is still wrong for the desktop security model.
- `apps/desktop/src/features/marketData/stockSdkProviderOperations.ts` dynamically imports and executes `stock-sdk` from the renderer-side gateway path when the guarded primary provider is enabled.
- Cache and strategy modules consume normalized bars/quotes and provider IDs, so they should not need provider-specific changes if IPC responses preserve the current gateway result shape.

Target IPC surface:

```ts
window.quantDesktop.marketData.getProviderStatus()
window.quantDesktop.marketData.fetchQuoteSnapshot(items)
window.quantDesktop.marketData.fetchHistoricalBars(request)
window.quantDesktop.marketData.fetchIntradayBars(request)
window.quantDesktop.marketData.connectQuoteStream(items)
window.quantDesktop.marketData.readQuoteStreamSnapshot(items)
window.quantDesktop.marketData.disconnectQuoteStream()
```

Target response contract:

- Quote and bar responses preserve `provider`, `market`, `symbol`, `timeframe`, `timestamp`, and `delayLevel` metadata.
- Error responses include a stable code, message, tried provider list, provider health list, and optional retry hint.
- Health responses include current provider priority, capability, status, latency, delay level, and fallback source.
- `realtime` chart history must continue to request intraday data through `fetchIntradayBars`, then normalize returned minute bars into the `realtime` cache.

Migration plan:

1. Completed: add shared IPC request/response types and channel names for provider-neutral market data without changing runtime behavior.
2. Completed: add a preload/main empty shell for `window.quantDesktop.marketData.*` with typed methods and tests that assert the bridge shape.
3. Completed: move quote snapshot gateway construction into the main-process IPC handler while leaving legacy AlphaFeed/LongBridge bridge methods intact.
4. Completed: move historical and intraday bar requests into the main-process IPC handler, preserving the `realtime` uses-intraday rule.
5. Completed: move AlphaFeed WebSocket connect/read/disconnect behind the provider-neutral stream methods.
6. Completed: replace chart workspace gateway construction with chart-facing access calls that prefer `window.quantDesktop.marketData.*` and keep cache/strategy behavior unchanged.
7. Completed: add diagnostics tests for fallback order, rate-limit/unauthorized/network errors, delayed provider states, and provider status reporting.
8. Completed: run desktop tests, typecheck, build, and `probe:stock-sdk`.
9. Next: final review and rollback commit.

Stage 2 implementation notes:

- Added `apps/desktop/src/electron/marketDataIpcContract.ts` as the provider-neutral desktop IPC contract.
- Added stable channel names for provider status, quote snapshots, historical bars, intraday bars, quote stream connect/read/disconnect.
- Added typed request context, error codes, fallback metadata, provider status payloads, stream states, and success/error result shapes.
- Added `marketDataIpcDefaultProviderPriority` with `stock-sdk`, AlphaFeed REST, AlphaFeed WebSocket, and LongBridge in the target order.
- Added `apps/desktop/tests/market-data-ipc-contract.test.ts` to protect channel names, provider priority, and metadata-bearing result shape.
- No renderer, preload, main-process handler, chart, cache, strategy, or provider behavior was switched in this stage.

Stage 3 implementation notes:

- Added `apps/desktop/src/electron/marketDataIpc.ts` to register provider-neutral `marketData:*` IPC handlers.
- Added `createMarketDataIpcShellHandlers()` so the bridge can exist before live provider wiring and return structured `PROVIDER_UNAVAILABLE` errors for unwired quote/bar/stream calls.
- Registered the shell in `apps/desktop/src/electron/main.ts` without removing or changing the existing AlphaFeed and LongBridge compatibility bridges.
- Exposed `window.quantDesktop.marketData.*` from `apps/desktop/src/electron/preload.ts`.
- Added renderer global types in `apps/desktop/src/vite-env.d.ts` for provider-neutral market-data requests, results, errors, health, fallback metadata, bars, quotes, and stream state.
- Extended `apps/desktop/tests/market-data-ipc-contract.test.ts` to verify shell provider status and structured unavailable errors.
- No chart, cache, strategy, API configuration, or provider selection behavior was switched in this stage.

Stage 4 implementation notes:

- Added `apps/desktop/src/electron/marketDataIpcHandlers.ts` as the Electron-safe provider-neutral handler factory without importing `ipcMain`, so handler behavior can be tested in Node.
- The main process now builds the quote snapshot gateway from secure credential reads and provider adapters. Stock SDK remains the default primary provider, with AlphaFeed REST and LongBridge registered from encrypted credentials when available.
- `apps/desktop/src/pages/ChartWorkspacePage.tsx` now uses `window.quantDesktop.marketData.fetchQuoteSnapshot` for batch quote polling when the provider-neutral bridge exists, while preserving the old renderer gateway path as compatibility fallback.
- The renderer no longer needs AlphaFeed or LongBridge credentials for the quote polling request path. WebSocket, historical bars, and intraday bars still use the previous paths until later migration stages.
- `marketDataIpcContract.ts` and renderer types now allow a temporary `providerPolicy.stockSdkPrimaryEnabled` flag so the existing user-facing Stock SDK opt-out remains respected while provider policy is moved behind the desktop boundary.
- Desktop tests cover Stock SDK primary quote fetch through the provider-neutral handler and the no-provider error path when Stock SDK is disabled and no fallback credentials exist.

Stage 5 implementation notes:

- The provider-neutral main-process handler now wires `fetchHistoricalBars` and `fetchIntradayBars` through the same secure-credential-backed provider registry as quote snapshots.
- Historical bar priority matches the chart gateway behavior: Stock SDK, LongBridge, AlphaFeed REST when Stock SDK is enabled; otherwise LongBridge then AlphaFeed REST.
- Intraday bar priority matches the chart gateway behavior: Stock SDK, AlphaFeed REST, LongBridge when Stock SDK is enabled; otherwise AlphaFeed REST then LongBridge.
- The chart's historical K-line load and realtime intraday-history load now call `window.quantDesktop.marketData.fetchHistoricalBars` or `fetchIntradayBars` when available, while preserving the old renderer gateway fallback path.
- The `realtime` chart history still requests provider `1m` bars through `intradayBars` and normalizes them into the `realtime` cache before merging with live points.
- Desktop tests cover Stock SDK historical bars and realtime-history intraday bars through the provider-neutral handler.

Stage 6 implementation notes:

- The provider-neutral main-process handler now controls AlphaFeed WebSocket connect/read/disconnect through the existing stream session, using secure AlphaFeed stream credentials from the desktop credential store.
- `MarketDataIpcStreamConnectRequest` carries the existing AlphaFeed stream mode policy so the chart can keep watchlist or all-symbol member-channel behavior without reading stream credentials in renderer space.
- Stream snapshot responses are normalized into provider-neutral quote snapshots with `provider: "alphafeed-websocket"`, realtime delay metadata, stream health, and fallback metadata.
- The chart workspace now prefers `window.quantDesktop.marketData.connectQuoteStream`, `readQuoteStreamSnapshot`, and `disconnectQuoteStream` when available, while preserving the old renderer gateway stream path for compatibility.
- Desktop tests cover secure-credential stream control, all-symbol mode forwarding, normalized stream snapshots, disconnect state, and the unconfigured stream credential error path.

Stage 7 implementation notes:

- Added a chart-facing `createChartMarketDataAccess` layer that hides provider-neutral IPC and legacy gateway fallback behind one interface.
- `ChartWorkspacePage` no longer imports provider credential readers or `createChartMarketDataGateways`.
- In desktop mode, quote snapshots, historical bars, intraday bars, and stream control are routed through `window.quantDesktop.marketData.*`.
- The legacy renderer gateway remains isolated inside the access layer for non-desktop/browser compatibility and still preserves Stock SDK, AlphaFeed REST/WebSocket, and LongBridge behavior.
- Desktop tests cover that provider-neutral access does not read legacy credentials or call legacy AlphaFeed/LongBridge bridge methods when `marketData` IPC is available.

Stage 8 implementation notes:

- `getProviderStatus` is now wired in the provider-neutral main-process handler and reports provider priority, provider health views, capabilities, and checked time from the secure main-side provider registry.
- IPC tests now cover provider status, Stock SDK primary-provider failure diagnostics, stream unauthorized health, stream rate-limit health, and unconfigured stream credentials.
- Compatibility provider tests now cover rate-limit diagnostics when every fallback provider is unavailable and delayed LongBridge health when fallback succeeds.
- `MarketDataGateway` now refreshes a provider's health after an operation throws, so error responses carry the latest failed-provider status instead of the pre-request status.

Stage 9 verification notes:

- `npm run test:desktop` passed with 105 tests.
- `npm run typecheck` passed.
- `npm run build` passed.
- `npm run probe:stock-sdk` passed 10/10 checks and refreshed `docs/generated/stock-sdk-provider-probe-latest.json`.
- The provider-neutral IPC migration keeps Stock SDK as the default primary provider and keeps AlphaFeed REST, AlphaFeed WebSocket, and LongBridge as fallback providers.

Acceptance:

- Renderer chart code can request quotes/bars through provider-neutral IPC.
- Existing encrypted credentials remain readable.
- Existing chart behavior, cache behavior, and strategy behavior remain unchanged.
- Typecheck, desktop tests, build, and provider probes pass.
- Existing `window.quantDesktop.alphaFeed.*` and `window.quantDesktop.longPort.*` compatibility endpoints remain available until the new IPC path is proven stable.

## Security Policy

- Do not commit API keys.
- Do not store full API keys in renderer-local storage.
- Store only redacted summaries in local app state.
- Store full AlphaFeed and LongBridge credentials only through the desktop secure credential bridge.
- Encrypt stored credentials with Electron `safeStorage` before writing to the user data directory.
- Keep broker SDK calls and external network requests behind the desktop bridge.
- Treat all third-party API responses as untrusted and validate shape before use.
- Treat `stock-sdk` upstream responses as untrusted external data even though the package provides TypeScript types.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Public upstream endpoints can change or rate-limit | High | Keep fallback providers and health-based failover |
| `stock-sdk` has no confirmed native WebSocket | Medium | Model as REST/polling; keep AlphaFeed WebSocket fallback |
| Symbol formats differ by provider and endpoint | High | Centralize symbol mapping in provider adapters |
| Invalid or unsuitable OHLC values | High | Validate and repair/reject at adapter boundary |
| Current chart directly references AlphaFeed/LongBridge | Medium | Introduce gateway in compatibility mode before switching |
| Existing cache provider enum is narrow | Medium | Add backward-compatible provider ID migration |
| Mixed historical and live data can overwrite newer points | High | Use provider-neutral merge rules based on timestamp and source role |

## Test Plan

- Provider registry unit tests: capability lookup, duplicate provider protection, priority order, missing provider behavior.
- Gateway unit tests: fallback order, health classification, no-data fallback, provider-error fallback.
- Compatibility provider unit tests: AlphaFeed REST quote/bar mapping, AlphaFeed WebSocket snapshot mapping, LongBridge quote/bar mapping, and fallback after a failed primary provider.
- Symbol normalization tests: CN, HK, US app symbols to provider request symbols.
- Adapter normalization tests: quote snapshots, daily bars, intraday bars, invalid OHLC handling.
- Cache compatibility tests: legacy provider IDs, new provider IDs, sync state provider IDs, quote snapshot provider IDs, K-line bars, and K-line metadata.
- Realtime merge tests: historical refresh must preserve newer live bars from any live-capable provider, including gateway provider IDs.
- UI smoke tests: API configuration page sections, chart still renders current cached data.
- Full checks after each implementation slice: `npm run typecheck`, relevant package tests, and `npm run build` before packaging work.

## Remaining Work

1. Add provider-neutral desktop IPC through `window.quantDesktop.marketData.*` so renderer pages no longer construct provider gateways from concrete credentials.
2. Add a richer provider-event timeline for fallback, rate-limit, delayed-history, and source-switch events.
3. Confirm whether `stock-sdk` exposes or plans a native WebSocket stream. Until then, do not model it as a WebSocket provider.
