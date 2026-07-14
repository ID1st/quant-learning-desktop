# Windows Desktop Release Notes — 2026-07-14

## Release Identity

- Application version: `0.1.0`
- Source commit: `270a612`
- Platform: Windows x64
- Runtime: Electron `42.5.1`
- Installer: NSIS, assisted installation, per-user by default, installation directory selectable

## Included Changes

- Trend Targets and other realtime strategies consume canonical one-minute OHLC candles independently of the chart's line/candlestick display mode.
- Live quote snapshots update one candle per exchange minute using provider quote time.
- Realtime strategy warmup covers five weekday sessions, with a 2,500-bar request budget and ten-calendar-day cache retention.
- UTORB and Trend Targets retain their original Pine Script default parameters.

## Installer Artifact

- File: `release/quant-learning-desktop-2026-07-14/量化学习桌面版 Setup 0.1.0.exe`
- Size: `110,732,251` bytes (`105.60 MiB`)
- SHA-256: `CCF422618BC8C19419363F667469BADCAFB25A6DEC176776C45CDAB81F72978B`
- Block map: `量化学习桌面版 Setup 0.1.0.exe.blockmap`

Packaging command:

```powershell
$env:QUANT_DESKTOP_RELEASE_DIR = "D:\量化学习系统桌面版\release\quant-learning-desktop-2026-07-14"
npm.cmd run package:win -w @quant/desktop
```

## Verification

- `npm.cmd run test:desktop`: 181 passing.
- `npm.cmd run test:strategy-engine`: 35 passing.
- `npm.cmd run typecheck`: passed.
- `electron-vite build`: main, preload, and renderer production bundles passed.
- `electron-builder --win nsis`: passed.
- Unpacked executable remained running during the startup smoke-test window and was then closed cleanly by the verification script.

## Known Release Limitations

- No application icon is configured, so Electron Builder uses the default Electron icon.
- No Authenticode publisher certificate is configured. The installer status is `NotSigned`, and Windows may display an unknown-publisher warning.
- The configured npm mirror returned `404 NOT_IMPLEMENTED` for the advisory API, so `npm audit --audit-level=high --omit=dev` could not produce a vulnerability report. Automated tests and builds were unaffected.
- Exact TradingView signal equality still depends on upstream OHLC, session, adjustment, exchange-calendar, and in-progress candle parity.

## Rollback

- Code rollback point: the parent of commit `270a612`, or revert `270a612` to remove the realtime minute-candle alignment fix.
- Installer rollback: retain and reinstall the prior installer; this build does not include a database schema migration.
