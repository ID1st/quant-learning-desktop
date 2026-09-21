import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

if (!process.argv[2]) throw new Error("Pass the packaged application path.");
const application = resolve(process.argv[2]);
const executable =
  process.platform === "darwin"
    ? join(application, "Contents", "MacOS", basename(application, ".app"))
    : application;
const smokeDirectory = mkdtempSync(join(tmpdir(), "quant-startup-smoke-"));
console.log(`Startup verification output: ${smokeDirectory}`);

for (const phase of ["fresh", "preserved-profile", "stalled-keychain"]) {
  const resultPath = join(smokeDirectory, `${phase}.json`);
  const tokenPath = join(smokeDirectory, "profile", "auth-session.enc");
  if (phase === "stalled-keychain") {
    // Force restoration from an old envelope in the isolated test profile.
    writeFileSync(
      tokenPath,
      JSON.stringify({ version: 1, encryptedPayload: "b2xkLWNpcGhlcnRleHQ=" }),
    );
  }
  const child = spawn(
    executable,
    [
      "--packaged-renderer-smoke",
      `--packaged-renderer-smoke-result=${resultPath}`,
      `--release-smoke-user-data=${join(smokeDirectory, "profile")}`,
      ...(phase === "stalled-keychain" ? ["--smoke-stalled-keychain"] : []),
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Packaged startup stalled (${phase}); output: ${smokeDirectory}`));
    }, 30_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolveExit();
      else
        reject(
          new Error(`Packaged startup failed (${phase}, exit ${code}); output: ${smokeDirectory}`),
        );
    });
  });
  const result = JSON.parse(readFileSync(resultPath, "utf8"));
  if (result.ok !== true) throw new Error(`Startup verification failed: ${JSON.stringify(result)}`);
  if (
    phase === "stalled-keychain" &&
    (!result.keychainRestoreProbeUsed ||
      !result.loginShownWhileRestoring ||
      existsSync(tokenPath) ||
      result.phase !== "SIGNED_OUT")
  ) {
    throw new Error("Stalled Keychain restoration did not safely return to sign-in.");
  }
  console.log(`${phase}: ${JSON.stringify(result)}`);
}
