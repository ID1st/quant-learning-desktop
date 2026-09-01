import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertReleaseEnvironment,
  assertSafeReleaseDirectory,
  findWindowsReleaseTargets,
  inspectAuthenticodeSignature,
  writeReleaseReport,
} from "./windows-release-gate.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
const desktopAppDir = join(workspaceRoot, "apps", "desktop");
const releaseDir = assertSafeReleaseDirectory(
  process.env.QUANT_DESKTOP_RELEASE_DIR || join(tmpdir(), "quant-learning-desktop-release"),
  [workspaceRoot, desktopAppDir, tmpdir()],
);
const npmCli =
  process.env.npm_execpath ||
  join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npxCli = join(dirname(npmCli), "npx-cli.js");
const builderArgs = process.argv.slice(2);
const productionAuthBaseUrl = "https://auth.fnndp.xyz";
const formalWindowsRelease = builderArgs.includes("--win");
const macRelease = builderArgs.includes("--mac");

if (builderArgs.length === 0) {
  console.error(
    "Usage: node scripts/package-desktop.mjs --dir | --win nsis | --mac dmg --x64|--arm64",
  );
  process.exit(1);
}

try {
  if (macRelease && process.platform !== "darwin") {
    throw new Error("macOS desktop packages must be built on macOS.");
  }

  if (formalWindowsRelease) {
    assertReleaseEnvironment(process.env);
    const previousInstaller = resolve(process.env.QUANT_PREVIOUS_INSTALLER);
    if (!existsSync(previousInstaller)) {
      throw new Error("QUANT_PREVIOUS_INSTALLER does not point to an existing installer.");
    }
    inspectAuthenticodeSignature(previousInstaller);
    if (process.platform !== "win32" || process.arch !== "x64") {
      throw new Error("Formal desktop releases must run on Windows x64.");
    }
    const worktreeStatus = runRequired(
      "git",
      ["status", "--porcelain=v1"],
      workspaceRoot,
      true,
    ).trim();
    if (worktreeStatus) {
      throw new Error("Formal desktop releases require a clean Git worktree.");
    }
    runRequired(process.execPath, [npmCli, "run", "quality"], workspaceRoot);
    runRequired(process.execPath, [npmCli, "run", "test"], workspaceRoot);
    runRequired(
      process.execPath,
      [npmCli, "audit", "--audit-level=high", "--registry=https://registry.npmjs.org"],
      workspaceRoot,
    );
    runRequired(process.execPath, [npmCli, "run", "build:cloud"], workspaceRoot);
    runRequired(process.execPath, [npmCli, "run", "build"], workspaceRoot);
  }

  const calendarCoverage = formalWindowsRelease
    ? runRequired(process.execPath, [npmCli, "run", "check:market-calendar"], workspaceRoot, true)
        .split(/\r?\n/u)
        .filter((line) => /^(CN|HK|US):/u.test(line))
    : [];

  rmSync(releaseDir, { recursive: true, force: true });
  runRequired(process.execPath, [npmCli, "run", "build:electron"], desktopAppDir);

  const builtMainPath = join(desktopAppDir, "out", "main", "main.js");
  const builtMain = readFileSync(builtMainPath, "utf8");
  if (
    !builtMain.includes(productionAuthBaseUrl) ||
    builtMain.includes("configuration-required.invalid")
  ) {
    throw new Error(`Packaged desktop authentication endpoint is not ${productionAuthBaseUrl}`);
  }

  const packageArguments = [
    npxCli,
    "electron-builder",
    ...builderArgs,
    ...(formalWindowsRelease ? ["--config.forceCodeSigning=true"] : []),
    `--config.directories.output=${releaseDir}`,
  ];
  runRequired(process.execPath, packageArguments, desktopAppDir);

  if (formalWindowsRelease) {
    const desktopPackage = JSON.parse(readFileSync(join(desktopAppDir, "package.json"), "utf8"));
    const targets = findWindowsReleaseTargets(releaseDir, desktopPackage.build.productName);
    const signatures = {
      installer: inspectAuthenticodeSignature(targets.installer),
      application: inspectAuthenticodeSignature(targets.application),
    };
    const previousInstaller = resolve(process.env.QUANT_PREVIOUS_INSTALLER);
    runRequired(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        join(scriptDir, "windows-release-smoke.ps1"),
        "-CurrentInstaller",
        targets.installer,
        "-CurrentApplication",
        targets.application,
        "-PreviousInstaller",
        previousInstaller,
        "-ProductName",
        desktopPackage.build.productName,
      ],
      workspaceRoot,
    );
    const revision = runRequired("git", ["rev-parse", "HEAD"], workspaceRoot, true).trim();
    const report = writeReleaseReport({
      workspaceRoot,
      releaseDirectory: releaseDir,
      version: desktopPackage.version,
      revision,
      targets,
      signatures,
      calendarCoverage,
    });
    console.log(`Release report: ${report.markdownPath}`);
  }

  console.log(`Desktop package output: ${releaseDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function runRequired(command, args, cwd, captureOutput = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: captureOutput ? "pipe" : "inherit",
    encoding: captureOutput ? "utf8" : undefined,
    shell: false,
    windowsHide: true,
  });
  if (captureOutput) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
  return captureOutput ? result.stdout : "";
}
