import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const desktopSource = resolve(import.meta.dirname, "..", "src");
const displayRoots = ["app", "layouts", "pages", "ui", "features/auth", "features/strategies"];
const forbiddenDisplayFormatting = [
  /new Date\([^\n]*\)\.toLocale(?:Date|Time)?String\(/u,
  /new Intl\.DateTimeFormat\((?:"zh-CN"|language)/u,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("user-facing desktop time displays use the shared time zone formatter", () => {
  const violations = displayRoots.flatMap((root) =>
    sourceFiles(join(desktopSource, root)).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return forbiddenDisplayFormatting.some((pattern) => pattern.test(source))
        ? [relative(desktopSource, path)]
        : [];
    }),
  );

  assert.deepEqual(violations, []);
});
