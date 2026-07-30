import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const stylesEntry = new URL("../src/styles.css", import.meta.url);
const stylesIndex = readFileSync(stylesEntry, "utf8");
const styles = [
  stylesIndex,
  ...Array.from(stylesIndex.matchAll(/@import\s+"([^"]+)"/g), ([, path]) =>
    readFileSync(new URL(path, stylesEntry), "utf8"),
  ),
].join("\n");

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

test("workspace keeps navigation fixed while main content owns vertical scroll", () => {
  const shellRule = cssRule(".app-shell");
  const sidebarRule = cssRule(".app-sidebar");
  const contentRule = cssRule(".app-content");

  assert.match(shellRule, /height:\s*100vh/);
  assert.match(shellRule, /overflow:\s*hidden/);
  assert.match(sidebarRule, /min-height:\s*0/);
  assert.match(sidebarRule, /overflow:\s*hidden/);
  assert.match(contentRule, /min-height:\s*0/);
  assert.match(contentRule, /overflow-y:\s*auto/);
});
