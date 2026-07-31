import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertReleaseEnvironment,
  assertSafeReleaseDirectory,
  createSha256,
  findWindowsReleaseTargets,
  writeReleaseReport,
} from "../windows-release-gate.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("release environment requires signing, PostgreSQL and previous installer inputs", () => {
  assert.throws(() => assertReleaseEnvironment({}), /CSC_LINK/u);
  assert.throws(
    () =>
      assertReleaseEnvironment({
        CSC_LINK: "certificate.pfx",
        CSC_KEY_PASSWORD: "secret",
      }),
    /TEST_DATABASE_URL/u,
  );
  assert.doesNotThrow(() =>
    assertReleaseEnvironment({
      CSC_LINK: "certificate.pfx",
      CSC_KEY_PASSWORD: "secret",
      TEST_DATABASE_URL: "postgresql://release-test",
      QUANT_PREVIOUS_INSTALLER: "previous.exe",
    }),
  );
});

test("release target discovery selects the top-level installer and packaged application", () => {
  const root = mkdtempSync(join(tmpdir(), "quant-release-gate-"));
  writeFileSync(join(root, "Quant Setup 1.0.0.exe"), "installer");
  const unpacked = join(root, "win-unpacked");
  mkdirSync(unpacked);
  writeFileSync(join(unpacked, "Quant Desktop.exe"), "application");
  writeFileSync(join(unpacked, "helper.exe"), "helper");

  const targets = findWindowsReleaseTargets(root, "Quant Desktop");

  assert.equal(targets.installer, join(root, "Quant Setup 1.0.0.exe"));
  assert.equal(targets.application, join(unpacked, "Quant Desktop.exe"));
  assert.equal(createSha256(targets.installer).length, 64);
});

test("release output cleanup rejects filesystem and protected roots", () => {
  const protectedRoot = resolve(tmpdir(), "quant-protected-workspace");
  assert.throws(
    () => assertSafeReleaseDirectory(parse(process.cwd()).root, [protectedRoot]),
    /release output/iu,
  );
  assert.throws(
    () => assertSafeReleaseDirectory(protectedRoot, [protectedRoot]),
    /release output/iu,
  );
  assert.doesNotThrow(() =>
    assertSafeReleaseDirectory(join(protectedRoot, "release", "candidate"), [protectedRoot]),
  );
});

test("release report records hashes, signatures, migration and rollback guidance", () => {
  const releaseDirectory = mkdtempSync(join(tmpdir(), "quant-release-report-"));
  const installer = join(releaseDirectory, "setup.exe");
  const application = join(releaseDirectory, "app.exe");
  writeFileSync(installer, "signed installer");
  writeFileSync(application, "signed application");

  const { report, jsonPath, markdownPath } = writeReleaseReport({
    workspaceRoot,
    releaseDirectory,
    version: "1.2.3",
    revision: "abc123",
    targets: { installer, application },
    signatures: {
      installer: { Status: "Valid" },
      application: { Status: "Valid" },
    },
    calendarCoverage: ["CN: 2025-01-01..2028-12-31"],
  });

  assert.equal(report.latestCloudMigration, "003_admin_invite_management.sql");
  assert.equal(report.artifact.authenticode.Status, "Valid");
  assert.equal(report.artifact.sha256.length, 64);
  assert.match(readFileSync(jsonPath, "utf8"), /windows-x64/u);
  assert.match(readFileSync(markdownPath, "utf8"), /回滚步骤/u);
});
