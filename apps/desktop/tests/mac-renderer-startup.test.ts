import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const desktopRoot = resolve(import.meta.dirname, "..");
const mainSource = readFileSync(resolve(desktopRoot, "src/electron/main.ts"), "utf8");
const htmlSource = readFileSync(resolve(desktopRoot, "index.html"), "utf8");
const guardSource = readFileSync(resolve(desktopRoot, "public/renderer-startup-guard.js"), "utf8");
const longPortBridgeSource = readFileSync(
  resolve(desktopRoot, "src/electron/longPortBridge.ts"),
  "utf8",
);

test("macOS disables GPU acceleration before Electron becomes ready", () => {
  const disableIndex = mainSource.indexOf('process.platform === "darwin"');
  const readyIndex = mainSource.indexOf("app\n  .whenReady()");
  assert.notEqual(disableIndex, -1);
  assert.notEqual(readyIndex, -1);
  assert.ok(disableIndex < readyIndex);
  assert.match(mainSource, /app\.disableHardwareAcceleration\(\)/u);
});

test("renderer displays a startup guard before loading the React module", () => {
  const guardIndex = htmlSource.indexOf("renderer-startup-guard.js");
  const applicationIndex = htmlSource.indexOf("/src/main.tsx");
  assert.ok(guardIndex >= 0 && guardIndex < applicationIndex);
  assert.match(guardSource, /dataset\.rendererStartupGuard/u);
  assert.match(guardSource, /Interface startup failed/u);
});

test("macOS avoids blocking the main loop on the native DuckDB cache", () => {
  assert.match(mainSource, /process\.platform === "darwin"\s*\? createMemoryMarketBarRepository/u);
  assert.doesNotMatch(mainSource, /^import .*duckDbMarketBarRepository/mu);
  assert.match(mainSource, /import\("\.\/duckDbMarketBarRepository"\)/u);
});

test("the renderer window is loaded before asynchronous authentication initialization", () => {
  const readyBlockIndex = mainSource.indexOf("const windowConfig = createMainWindowConfig()");
  const windowIndex = mainSource.indexOf("const mainWindow = createMainWindow", readyBlockIndex);
  const authIndex = mainSource.indexOf("await createMainAuthSessionManager()", readyBlockIndex);
  assert.notEqual(readyBlockIndex, -1);
  assert.notEqual(windowIndex, -1);
  assert.notEqual(authIndex, -1);
  assert.ok(windowIndex < authIndex);
});

test("market data provider modules load only after the renderer window is created", () => {
  assert.doesNotMatch(mainSource, /^import .*from "\.\/marketDataIpc"/mu);
  assert.doesNotMatch(mainSource, /^import .*from "\.\/providerDataIpc"/mu);
  const windowIndex = mainSource.indexOf("const mainWindow = createMainWindow");
  const providerImportIndex = mainSource.indexOf('import("./marketDataIpc")');
  assert.notEqual(windowIndex, -1);
  assert.notEqual(providerImportIndex, -1);
  assert.ok(windowIndex < providerImportIndex);
});

test("packaged renderer smoke result path can be supplied through LaunchServices arguments", () => {
  assert.match(mainSource, /readArgumentValue\("--packaged-renderer-smoke-result"\)/u);
});

test("LongBridge native SDK is loaded only when a provider operation needs it", () => {
  assert.match(longPortBridgeSource, /import type \{ QuoteContext \} from "longbridge"/u);
  assert.match(longPortBridgeSource, /import\("longbridge"\)/u);
  assert.doesNotMatch(longPortBridgeSource, /^import \{[^\n]+\} from "longbridge"/mu);
});
