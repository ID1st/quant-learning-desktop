import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electron = path.join(
  root,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);
const entry = path.join(root, "apps", "desktop", "out", "main", "authSmoke.js");

if (!existsSync(electron) || !existsSync(entry)) {
  throw new Error("Electron auth smoke prerequisites are missing. Run the Electron build first.");
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
    reject(new Error("Electron auth smoke test timed out"));
  }, 30_000);
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
    `Electron auth smoke test failed. stdout=${stdout.trim()} stderr=${stderr.trim()}`,
  );
}

console.log("Electron authentication smoke test passed.");
