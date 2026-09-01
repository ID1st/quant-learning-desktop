import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopPackage = JSON.parse(
  readFileSync(resolve(workspaceRoot, "apps", "desktop", "package.json"), "utf8"),
);
const macPackageWorkflow = readFileSync(
  resolve(workspaceRoot, ".github", "workflows", "package-macos.yml"),
  "utf8",
);

test("macOS package scripts build separate Intel and Apple Silicon DMGs", () => {
  assert.equal(
    desktopPackage.scripts["package:mac:x64"],
    "node ../../scripts/package-desktop.mjs --mac dmg --x64 --publish never",
  );
  assert.equal(
    desktopPackage.scripts["package:mac:arm64"],
    "node ../../scripts/package-desktop.mjs --mac dmg --arm64 --publish never",
  );
  assert.match(desktopPackage.scripts["package:mac"], /--x64 --arm64 --publish never$/u);
  assert.deepEqual(desktopPackage.build.mac.target, ["dmg"]);
  assert.match(desktopPackage.build.mac.artifactName, /\$\{arch\}/u);
});

test("macOS package config enables hardened runtime and notarization", () => {
  assert.equal(desktopPackage.build.mac.hardenedRuntime, true);
  assert.equal(desktopPackage.build.mac.notarize, true);
  assert.equal(desktopPackage.build.mac.icon, "build/icon.icns");
  assert.equal(existsSync(resolve(workspaceRoot, "apps", "desktop", "build", "icon.icns")), true);
});

test("macOS packaging runs each architecture on a matching GitHub runner", () => {
  assert.match(macPackageWorkflow, /arch: arm64\s+runner: macos-15/u);
  assert.match(macPackageWorkflow, /arch: x64\s+runner: macos-15-intel/u);
  assert.match(macPackageWorkflow, /package:mac:\$\{\{ matrix\.arch \}\}/u);
});
