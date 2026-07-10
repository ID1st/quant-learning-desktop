# UI Redesign Plan

## Direction

The product visual direction is **Precision FinTech Research Terminal**: a chart-first desktop workstation with the information density of a professional market terminal, the panel discipline of Figma and VS Code, and restrained interaction feedback.

The redesign does not change market-data, strategy, cache, or credential boundaries. It changes information hierarchy, reusable visual tokens, navigation, panel behavior, and interaction feedback in small verified slices.

## Design Rules

- Keep the chart as the primary visual surface in the chart workspace.
- Do not render a brand logo in the upper-left application chrome. Use a compact icon navigation rail with accessible labels and tooltips instead.
- Use Chinese-readable UI typography and tabular numeric typography for prices, time, OHLCV, and logs.
- Prefer docked panels and separators over card-heavy page layouts.
- Keep provider diagnostics concise by default. Detailed fallback, latency, and gap explanations belong in an on-demand diagnostics surface.
- Do not expose internal phase terminology or implementation details in customer-facing UI.
- Market data refreshes must remain visually stable; do not animate chart scale, position, or price bars on refresh.

## Layout Model

```text
Icon navigation rail (72px)
  -> page content canvas
  -> page-specific command/context bar
  -> primary work surface
  -> optional dock panels
  -> compact status strip
```

### Super Chart

- Two-tier context: concise symbol/OHLC context plus compact actions.
- Right dock: watchlist, instrument details, and alerts.
- Bottom dock: collapsed by default, with strategies, signals, and logs on demand.
- Data source health appears as a short status indicator; the diagnostic timeline opens separately.

### Data Source Center

- Provider priority list on the left.
- Selected provider connection/configuration in the center.
- Runtime diagnostics and fallback history on the right.
- Credentials and advanced options remain collapsed until needed.

### Strategy Center

- Strategy directory on the left.
- Strategy details and parameters in the center.
- Run status and outputs on the right.
- Pine import is a dedicated dialog flow, not a permanent first-screen panel.

## Delivery Slices

1. **Foundation and chrome**: visual tokens, typography, icon navigation rail, responsive navigation, and accessibility focus treatment.
2. **Super Chart workspace**: hierarchy, compact data status, docked watchlist, bottom dock, usable tools, and provider diagnostics drawer.
3. **Data Source and Dashboard**: operational data-source center and task-oriented daily workspace.
4. **Strategy Center**: three-panel research flow, import dialog, parameters, and run results.
5. **Interaction quality**: command palette, keyboard shortcuts, toast feedback, loading/empty/error states, and reduced motion support.
6. **Visual verification**: 1280x800, 1440x900, and 1920x1080 review with real, delayed, empty, and fallback data states.

## Slice 1 Status

Completed:

- Global visual token foundation.
- Chinese UI font stack and tabular numeric treatment in chart/status surfaces.
- Upper-left app logo removed from the desktop chrome.
- 72px icon navigation rail with native tooltips and accessible labels.
- Compact-width navigation switches to a horizontal rail.

Verification requirements:

- `npm run typecheck`
- `npm run build`
- `npm run test:chart`
- Browser smoke verification for desktop and compact navigation states.

## Slice 2 Status

Completed:

- Data Source Center now uses provider priority navigation, a single selected configuration surface, and a separate diagnostics column.
- Existing AlphaFeed REST, AlphaFeed WebSocket, LongBridge, and Stock SDK configuration/state logic remains unchanged.
- Internal implementation-phase copy is removed from the main data-source workspace.
- Dashboard is now a task-oriented Today Workspace with real provider, cache, watchlist, and sync state.
- Unconfigured users receive a functional route to Data Source Center instead of a card-heavy empty dashboard.

Verification:

- Data Source Center and Today Workspace have no horizontal overflow at 1280x800, 1440x900, or 1920x1080.
- The selected provider controls which configuration panel is visible.
- Dashboard calls-to-action navigate to the existing Data Source Center or Super Chart routes.
