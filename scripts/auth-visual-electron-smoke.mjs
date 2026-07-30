import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmExecutable =
  process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "npm";
const npmArguments =
  process.platform === "win32"
    ? [
        "/d",
        "/s",
        "/c",
        "npm.cmd run build:electron -w @quant/desktop",
      ]
    : ["run", "build:electron", "-w", "@quant/desktop"];
const build = spawnSync(
  npmExecutable,
  npmArguments,
  {
    cwd: root,
    env: { ...process.env, VITE_AUTH_VISUAL_QA: "true" },
    stdio: "inherit",
  },
);
if (build.status !== 0) {
  throw new Error("Electron auth visual smoke build failed");
}
const electron = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const entry = path.join(
  root,
  "apps",
  "desktop",
  "out",
  "main",
  "authVisualSmoke.js",
);

if (!existsSync(electron) || !existsSync(entry)) {
  throw new Error(
    "Electron auth visual smoke prerequisites are missing.",
  );
}

const child = spawn(electron, [entry], {
  cwd: root,
  windowsHide: true,
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += String(chunk);
});
child.stderr.on("data", (chunk) => {
  stderr += String(chunk);
});

const exitCode = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error("Electron auth visual smoke test timed out"));
  }, 60_000);
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code) => {
    clearTimeout(timeout);
    resolve(code);
  });
});

if (exitCode !== 0 || !stdout.includes('"ok":true')) {
  throw new Error(
    `Electron auth visual smoke test failed. stdout=${stdout.trim()} stderr=${stderr.trim()}`,
  );
}

console.log("Electron authentication visual smoke test passed (36 states).");
