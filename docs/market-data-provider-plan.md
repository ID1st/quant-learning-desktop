# Market Data Provider Plan

## Current Decision

The system currently uses a split provider model:

- AlphaFeed REST and optional AlphaFeed WebSocket provide same-day quote updates.
- LongBridge provides historical K-line and intraday-history backfill.
- LongBridge also remains the broker/account integration path for future trading workflows.

The next decision is to introduce a provider-neutral market-data gateway before changing production traffic. `chengzuopeng/stock-sdk` is a candidate primary provider, while AlphaFeed REST, AlphaFeed WebSocket, and LongBridge should become fallback providers after the gateway is in place.

This document is a design and migration plan only. It does not authorize direct production integration of `stock-sdk` before the gateway, cache, and UI compatibility slices are implemented and verified.

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

Status: in progress. The provider-neutral type contracts, registry, and fallback gateway shell have been added in `apps/desktop/src/features/marketData/marketDataProviderGateway.ts`, with unit coverage in `apps/desktop/tests/market-data-provider-gateway.test.ts`. Existing production data fetching has not been switched yet.

Scope:

- Add provider-neutral types, registry, and gateway shell.
- Register existing AlphaFeed and LongBridge adapters through compatibility wrappers.
- Keep current chart behavior unchanged.

Acceptance:

- `npm run typecheck` passes.
- Existing desktop tests pass.
- Existing chart can still read current cache.

### Step 3: Cache Compatibility

Scope:

- Extend provider IDs while keeping legacy `alphafeed` and `longport` cache entries readable.
- Add mixed-provider metadata without changing the cache key format.

Acceptance:

- Old cache entries remain readable.
- New provider IDs can be sanitized and written.
- Tests cover legacy and new provider IDs.

### Step 4: Chart Uses Gateway

Scope:

- Move chart data loading from direct provider-specific calls to `MarketDataGateway`.
- Preserve current AlphaFeed and LongBridge behavior first.

Acceptance:

- `realtime`, `1d`, and `1w` charts still render as before.
- No provider-specific network calls remain directly in chart page logic except transitional credential reads if needed.

### Step 5: API Configuration Redesign

Scope:

- Update the configuration page to show primary provider placeholder and fallback provider sections.
- Do not make `stock-sdk` the live source yet.

Acceptance:

- Existing AlphaFeed and LongBridge credential flows remain usable.
- New provider status and priority layout is visible.

### Step 6: stock-sdk Adapter Behind Gateway

Scope:

- Add the adapter after the gateway is stable.
- Implement quote, historical bar, and intraday bar normalization.
- Keep it feature-flagged or disabled until tests pass.

Acceptance:

- Unit tests cover CN/HK/US quote normalization.
- Unit tests cover daily/intraday bar normalization.
- Tests cover CN `open: 0` repair/rejection and US secid mapping.
- Provider health maps network, empty, invalid response, rate-limit, and delayed states.

### Step 7: Controlled Primary Switch

Scope:

- Make `stock-sdk` the primary provider.
- Keep AlphaFeed REST/WebSocket and LongBridge fallback paths.

Acceptance:

- If `stock-sdk` returns empty or invalid data, the gateway falls back without breaking the chart.
- Provider diagnostics clearly show the active provider.
- Strategies still run only on normalized cached bars.

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
- Symbol normalization tests: CN, HK, US app symbols to provider request symbols.
- Adapter normalization tests: quote snapshots, daily bars, intraday bars, invalid OHLC handling.
- Cache compatibility tests: legacy provider IDs and new provider IDs.
- Realtime merge tests: historical refresh must preserve newer live bars from any live-capable provider.
- UI smoke tests: API configuration page sections, chart still renders current cached data.
- Full checks after each implementation slice: `npm run typecheck`, relevant package tests, and `npm run build` before packaging work.

## Remaining Work

1. Confirm whether `stock-sdk` exposes or plans a native WebSocket stream. Until then, do not model it as a WebSocket provider.
2. Wrap AlphaFeed REST, AlphaFeed WebSocket, and LongBridge with compatibility providers behind the gateway while leaving chart behavior unchanged.
3. Extend cache provider IDs without breaking legacy `alphafeed` and `longport` entries.
4. Move chart loading to the gateway after wrappers and cache compatibility are verified.
5. Redesign API configuration page around provider priority.
6. Add `stock-sdk` adapter after contracts and cache migration are in place.
7. Add richer visible mixed-source diagnostics, for example provider labels, active source badges, or provider timeline.
