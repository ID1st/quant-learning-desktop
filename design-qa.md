**Findings**

- [P2] Automated visual comparison is blocked
  Location: Phase 2 prototype QA.
  Evidence: the source visual target can be opened locally, but the in-app browser blocked local `file://` and local HTTP navigation for the rendered prototype with `net::ERR_BLOCKED_BY_CLIENT`; Chrome extension automation was unavailable.
  Impact: a side-by-side visual fidelity pass cannot be honestly marked as passed in this environment.
  Fix: reopen the prototype in a normal browser with `npm.cmd run dev -- --port 5173`, then capture desktop and narrow screenshots for final visual approval.

**Open Questions**

- Whether the next visual iteration should prioritize exact TradingView density or slightly larger learning-platform readability.

**Implementation Checklist**

- Build the isolated prototype.
- Verify Vite production build.
- Manually review the prototype in a normal browser.
- Capture desktop and responsive screenshots.
- Re-run visual QA against the selected source image.

**Follow-up Polish**

- Add an explicit login/register prototype view if Phase 2 should cover onboarding before the chart workspace.
- Add a strategy editor prototype panel for Pine Script-like editing.
- Add a plugin marketplace prototype panel.

source visual truth path: `C:\Users\Admin\.codex\generated_images\019f09c6-4b9a-7fc0-bf91-95d5bc7483d0\ig_0de87542a1ce3631016a3ff5bf5ca08191927057b6bc632200.png`

implementation screenshot path: blocked

viewport: intended desktop 1490x1060

state: default workbench, AAPL selected, UORB selected, Backtest tab selected

full-view comparison evidence: blocked because the browser automation surface could not open local file or local HTTP targets

focused region comparison evidence: blocked for the same reason

findings: one blocking verification issue remains; implementation build succeeds, but visual screenshot comparison is not complete

patches made since previous QA pass: none

final result: blocked

---

# SMC Visual QA

Status: passed for the Smart Money Concepts overlay contract.

## Evidence

- Reference: `C:/Users/Admin/AppData/Local/Temp/codex-clipboard-5f56fd48-7f81-4850-96c5-d01305216d4f.png`
- Implementation capture: `data/tmp/smc-visual-qa.png`
- Side-by-side comparison: `data/tmp/smc-visual-comparison.png`
- Viewport: 1984 × 842 CSS pixels and 1984 × 842 captured pixels
- Runtime: Electron Chromium against the Vite development build
- Console: no application errors; the development-only Electron CSP warning is absent from packaged builds

## Verified

- Bullish `#089981` and bearish `#F23645` structure colors
- Dashed internal structure and solid swing structure
- Dotted EQH/EQL connector and midpoint label placement
- Structure labels centered above bullish lines and below bearish lines
- Strong/Weak High/Low labels anchored at the right edge
- Swing order blocks behind candles with independent fill and border colors
- FVG rendered as two compact adjacent bands
- Candles rendered between lower zones and upper structure/label layers
- Time/price anchoring remains data-coordinate based
- Fixed fixture contains bullish and bearish BOS/CHoCH, EQH, strong/weak levels, bullish/bearish order blocks, and FVG

## Intentional exclusions

- TradingView navigation, logo, watermark, and product chrome are not copied.
- The product's existing candle theme, price axis, and typography remain in use; the reference image is used only for SMC overlay appearance and hierarchy.

final result: passed
