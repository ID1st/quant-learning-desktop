# Market Data Stability Plan

## Status

Completed on 2026-07-11. This slice stabilizes the provider-neutral chart data path without changing the chart, strategy, or cache contracts.

## Runtime Status And Cache Governance Update (2026-07-13)

This follow-up completes the selected stability scope without changing provider priority or the AlphaFeed WebSocket protocol:

- A shared runtime-status module classifies cache freshness, market session state, and chart events. The event timeline has bounded deduplication for cache hit/stale, synchronization, fallback, rate limit, delayed gap, closed-market, retained-cache, and error states.

## Tencent US Historical Symbol Resolution Update (2026-07-13)

- Tencent Finance US history now evaluates NASDAQ (`.OQ`), NYSE (`.N`), and AMEX (`.AM`) suffix candidates when a result is sparse. It keeps the first sufficiently complete result and remembers the selected suffix for the desktop-process lifetime.
- A non-empty response is no longer treated as complete by itself. This prevents symbols such as `SPCX.US` from retaining the Tencent `.OQ` fallback's 19 daily bars or 5 weekly bars when the `.AM` route provides the available 261 daily bars and 56 weekly bars.
- Historical chart cache is considered incomplete below 60 daily bars or 26 weekly bars. A fresh but incomplete local cache is refreshed even after market close, then overwritten by the normalized provider result.
- The chart diagnostic drawer now presents those events with Chinese labels. Provider credentials and raw request data remain outside the renderer diagnostics.
- For closed markets, a fresh daily or weekly cache renders directly and skips an unnecessary remote refresh. Intraday polling still follows the existing market-session window and stops after close.
- Refresh failure preserves usable cache and records a retained-cache event. Existing real-time merge rules continue to prevent historical bars from overwriting newer live points.
- AlphaFeed WebSocket protocol hardening and automated provider probes are intentionally excluded from this slice.

## Provider Priority

1. `stock-sdk`: primary source for CN/HK/US quote snapshots and for CN/HK current-session 1-minute timelines.
2. `alphafeed-rest`: configured credential-backed REST fallback.
3. `longbridge`: configured fallback and broker integration path.
4. `yahoo-finance`: US-only, last-resort bar fallback. It does not provide websocket or quote-snapshot capability and must not be required for mainland-network operation.
5. `alphafeed-websocket`: configured member streaming fallback for quote snapshots.

The selected provider is capability- and market-specific. Yahoo is intentionally skipped for quote snapshots because it declares no `realtimeQuote` capability. CN/HK daily and weekly bars still try Stock SDK first, then credential-backed fallback providers when configured.

## 2026-07-11 Connectivity Result

- The production Stock SDK adapter successfully returned one batch of CN/HK/US quotes. Tencent's US code `AAPL.OQ` is normalized to the application symbol `AAPL.US`.
- The adapter successfully returned 267 CN and 332 HK current-session 1-minute bars through `quotes.timeline`, without waiting for the unavailable minute K-line route.
- Yahoo Finance successfully returned 1,255 AAPL daily bars and 1,951 AAPL 1-minute bars through the same provider-neutral IPC path, but is retained only as an optional US emergency route because it can be blocked in mainland networks.
- Stock SDK daily, weekly, and US minute K-lines currently reach Eastmoney `push2his` hosts that are reset or timed out by this network. This is an upstream connectivity condition, not a malformed response or chart-cache defect. Tencent timeline data is current-session intraday data only and cannot replace multi-day history.
- AlphaFeed REST and LongBridge remain credential-backed fallbacks. Legacy credentials without the explicit activation marker remain inactive until reverified in the API configuration page.

## Failure and Cache Rules

- Provider errors are passed through the neutral gateway with the latest sanitized provider-health message.
- Stock SDK K-line network failures are classified as transient and trip a 60-second main-process circuit breaker, so chart switching immediately uses a configured fallback rather than repeatedly waiting on the unavailable Eastmoney route.
- Yahoo retries one transient network or HTTP 5xx request with bounded linear backoff. Authentication and rate-limit responses are not retried by this provider.
- If an intraday or historical refresh fails, the current local cache remains the displayed data. The chart status explicitly reports the retained cache count.
- Historical realtime bars are merged with newer live points; historical data cannot overwrite newer live points.

## Performance Rules

- The chart renders cached bars first, then refreshes in the background.
- Concurrent identical chart-bar requests share one in-flight request.
- Realtime data keeps full raw bars for cache and strategy execution. Only the chart render input is sampled when it exceeds 1,200 points; first/last points and per-bucket high/low extrema are retained.
- Viewport, price scale, and right-side spacing remain owned by the chart viewport model, so a background refresh does not reset a user's view.

## Capability and External Risk

Yahoo Finance is a best-effort public fallback, not a guaranteed real-time feed. Current implementation only claims US chart bars and declares `delayLevel: unknown`; upstream rate limits, access restrictions, delayed data, or network blocks can make it unavailable. Stock SDK also depends on upstream network sources, so the UI must retain cache and expose fallback diagnostics rather than promise continuous availability.

For CN/HK daily and weekly history, the operational solution is to configure and verify AlphaFeed REST or LongBridge as a fallback, or allow the Stock SDK Eastmoney K-line hosts through the local proxy/firewall policy. The application must not synthesize missing multi-day history from an intraday timeline.

## Verification

- Provider fallback, provider-health detail, transient retry, and render sampling have desktop regression coverage.
- The chart test suite verifies future-area pan, stable viewport updates, and right-axis price scaling.
- Electron development mode was restarted after the main-process IPC change; the window responded successfully and a local renderer page loaded with a clean console.
