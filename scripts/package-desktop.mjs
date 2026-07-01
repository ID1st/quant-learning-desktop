import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
const desktopAppDir = join(workspaceRoot, "apps", "desktop");
const releaseDir = process.env.QUANT_DESKTOP_RELEASE_DIR || join(tmpdir(), "quant-learning-desktop-release");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const useShell = process.platform === "win32";
const builderArgs = process.argv.slice(2);

if (builderArgs.length === 0) {
  console.error("Usage: node scripts/package-desktop.mjs --dir | --win nsis");
  process.exit(1);
}

rmSync(releaseDir, { recursive: true, force: true });

const buildResult = spawnSync(npmCommand, ["run", "build:electron"], {
  cwd: desktopAppDir,
  stdio: "inherit",
  shell: useShell,
});

if (buildResult.error) {
  console.error(buildResult.error.message);
  process.exit(1);
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const packageResult = spawnSync(npxCommand, [
  "electron-builder",
  ...builderArgs,
  `--config.directories.output=${releaseDir}`,
], {
  cwd: desktopAppDir,
  stdio: "inherit",
  shell: useShell,
});

if (packageResult.error) {
  console.error(packageResult.error.message);
  process.exit(1);
}

if (packageResult.status === 0) {
  console.log(`Desktop package output: ${releaseDir}`);
}

process.exit(packageResult.status ?? 1);
