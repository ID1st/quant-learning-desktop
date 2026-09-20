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
const packageScript = readFileSync(
  resolve(workspaceRoot, "scripts", "package-desktop.mjs"),
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
  assert.match(macPackageWorkflow, /package:internal:mac:\$\{\{ matrix\.arch \}\}/u);
});

test("internal packaging creates three 0.1.8 installers with runnable ad-hoc macOS apps", () => {
  assert.equal(desktopPackage.version, "0.1.8");
  assert.equal(
    desktopPackage.scripts["package:internal:win:x64"],
    "node ../../scripts/package-desktop.mjs --internal --win nsis --x64 --publish never",
  );
  assert.equal(
    desktopPackage.scripts["package:internal:mac:x64"],
    "node ../../scripts/package-desktop.mjs --internal --mac dmg --x64 --publish never",
  );
  assert.equal(
    desktopPackage.scripts["package:internal:mac:arm64"],
    "node ../../scripts/package-desktop.mjs --internal --mac dmg --arm64 --publish never",
  );
  assert.equal(
    desktopPackage.build.win.artifactName,
    "quant-learning-desktop-${version}-win-${arch}.${ext}",
  );
  assert.match(packageScript, /formalWindowsRelease = windowsRelease && !internalPackage/u);
  assert.match(packageScript, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/u);
  assert.match(packageScript, /--config\.mac\.identity=-/u);
  assert.match(packageScript, /--config\.mac\.hardenedRuntime=false/u);
  assert.match(packageScript, /--config\.mac\.notarize=false/u);
});

test("workflow uploads one Windows and two macOS architecture artifacts", () => {
  assert.match(macPackageWorkflow, /Package Windows x64/u);
  assert.match(macPackageWorkflow, /package:internal:win:x64/u);
  assert.match(macPackageWorkflow, /Get-AuthenticodeSignature/u);
  assert.match(macPackageWorkflow, /hdiutil verify/u);
  assert.match(macPackageWorkflow, /codesign --verify --deep --strict/u);
  assert.match(macPackageWorkflow, /Signature=adhoc/u);
  assert.match(macPackageWorkflow, /--packaged-renderer-smoke/u);
  assert.match(macPackageWorkflow, /run_renderer_smoke preserved-profile/u);
  assert.match(macPackageWorkflow, /mktemp -d "\$\{TMPDIR%\/\}\/quant-renderer-smoke/u);
  assert.doesNotMatch(macPackageWorkflow, /RUNNER_TEMP.*quant-renderer-smoke/u);
  assert.match(macPackageWorkflow, /quant-learning-desktop-windows-x64/u);
  assert.match(macPackageWorkflow, /quant-learning-desktop-mac-\$\{\{ matrix\.arch \}\}/u);
});

test("longbridge macOS native bindings are pinned for every release architecture", () => {
  for (const arch of ["arm64", "x64"]) {
    const binding = `longbridge-darwin-${arch}`;
    assert.equal(
      desktopPackage.optionalDependencies[binding],
      "4.3.3",
      `${binding} must be a direct optional dependency of @quant/desktop`,
    );
  }
  assert.ok(
    desktopPackage.build.asarUnpack.some((pattern) => pattern.includes("longbridge")),
    "longbridge native .node files must be unpacked from the asar archive",
  );
});

test("package-lock.json contains the longbridge macOS native binding tarballs", () => {
  const lockfile = JSON.parse(readFileSync(resolve(workspaceRoot, "package-lock.json"), "utf8"));
  const packagePrefix = lockfile.packages["node_modules/longbridge"]
    ? "node_modules"
    : "apps/desktop/node_modules";
  const longbridge = lockfile.packages[`${packagePrefix}/longbridge`];
  assert.ok(longbridge, "package-lock.json must contain the longbridge package");

  for (const binding of Object.keys(longbridge.optionalDependencies)) {
    if (!binding.startsWith("longbridge-darwin-")) {
      continue;
    }
    const locked = lockfile.packages[`${packagePrefix}/${binding}`];
    assert.ok(
      locked,
      `${binding} is missing from package-lock.json, so 'npm ci' on macOS silently skips it ` +
        "and the packaged app fails at launch with 'Cannot find native binding'",
    );
    assert.equal(locked.version, longbridge.optionalDependencies[binding]);
    assert.ok(
      locked.resolved && locked.integrity,
      `${binding} must pin resolved url and integrity`,
    );
    assert.deepEqual(locked.os, ["darwin"]);
    assert.equal(locked.optional, true);
  }
});

test("macOS packaging verifies the native binding inside the built application", () => {
  assert.match(
    macPackageWorkflow,
    /app\.asar\.unpacked\/node_modules\/longbridge-darwin-\$\{\{ matrix\.arch \}\}/u,
  );
});
