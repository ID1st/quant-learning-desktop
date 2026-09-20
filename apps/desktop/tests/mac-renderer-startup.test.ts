import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const desktopRoot = resolve(import.meta.dirname, "..");
const mainSource = readFileSync(resolve(desktopRoot, "src/electron/main.ts"), "utf8");
const htmlSource = readFileSync(resolve(desktopRoot, "index.html"), "utf8");
const guardSource = readFileSync(resolve(desktopRoot, "public/renderer-startup-guard.js"), "utf8");

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
});
