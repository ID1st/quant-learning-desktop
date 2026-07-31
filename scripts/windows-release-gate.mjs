import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, parse, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function assertReleaseEnvironment(environment) {
  const signingCertificate = environment.WIN_CSC_LINK?.trim() || environment.CSC_LINK?.trim();
  const signingPassword =
    environment.WIN_CSC_KEY_PASSWORD?.trim() || environment.CSC_KEY_PASSWORD?.trim();
  const required = [
    ["CSC_LINK (or WIN_CSC_LINK)", signingCertificate],
    ["CSC_KEY_PASSWORD (or WIN_CSC_KEY_PASSWORD)", signingPassword],
    ["TEST_DATABASE_URL", environment.TEST_DATABASE_URL?.trim()],
    ["QUANT_PREVIOUS_INSTALLER", environment.QUANT_PREVIOUS_INSTALLER?.trim()],
  ];
  const missing = required.find(([, value]) => !value);
  if (missing) {
    throw new Error(`Formal Windows release requires ${missing[0]}.`);
  }
}

export function assertSafeReleaseDirectory(candidate, protectedPaths) {
  const resolvedCandidate = resolve(candidate);
  const protectedSet = new Set(protectedPaths.map((path) => resolve(path).toLowerCase()));
  if (
    resolvedCandidate === parse(resolvedCandidate).root ||
    protectedSet.has(resolvedCandidate.toLowerCase())
  ) {
    throw new Error("Release output directory is too broad or protected.");
  }
  return resolvedCandidate;
}

export function findWindowsReleaseTargets(releaseDirectory, productName) {
  const installerCandidates = readdirSync(releaseDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => join(releaseDirectory, entry.name))
    .sort();
  if (installerCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one top-level Windows installer, found ${installerCandidates.length}.`,
    );
  }

  const application = join(releaseDirectory, "win-unpacked", `${productName}.exe`);
  if (!existsSync(application)) {
    throw new Error(`Packaged application executable is missing: ${application}`);
  }
  return { installer: installerCandidates[0], application };
}

export function createSha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function inspectAuthenticodeSignature(path) {
  if (process.platform !== "win32") {
    throw new Error("Authenticode verification requires Windows.");
  }
  const command = [
    "$signature = Get-AuthenticodeSignature -LiteralPath $env:QUANT_SIGNATURE_TARGET",
    "$result = [ordered]@{",
    "Status = $signature.Status.ToString()",
    "StatusMessage = $signature.StatusMessage",
    "SignerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }",
    "SignerThumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }",
    "TimestampSubject = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }",
    "}",
    "$result | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      encoding: "utf8",
      env: { ...process.env, QUANT_SIGNATURE_TARGET: path },
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Authenticode inspection failed for ${basename(path)}: ${
        result.error?.message || result.stderr.trim() || "unknown error"
      }`,
    );
  }
  const signature = JSON.parse(result.stdout.trim());
  if (signature.Status !== "Valid") {
    throw new Error(
      `Authenticode signature for ${basename(path)} is ${signature.Status}, expected Valid.`,
    );
  }
  return signature;
}

export function latestCloudMigration(workspaceRoot) {
  const migrationsDirectory = join(workspaceRoot, "apps", "cloud-server", "migrations");
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => /^\d{3}_.+\.sql$/u.test(name))
    .sort();
  if (migrations.length === 0) {
    throw new Error("No cloud database migrations were found.");
  }
  return migrations.at(-1);
}

export function writeReleaseReport(options) {
  const report = {
    generatedAt: new Date().toISOString(),
    version: options.version,
    revision: options.revision,
    platform: "windows-x64",
    artifact: {
      fileName: basename(options.targets.installer),
      sha256: createSha256(options.targets.installer),
      authenticode: options.signatures.installer,
    },
    packagedApplication: {
      fileName: basename(options.targets.application),
      sha256: createSha256(options.targets.application),
      authenticode: options.signatures.application,
    },
    verification: {
      quality: "passed",
      tests: "passed-with-postgresql-integration",
      audit: "passed",
      calendarCoverage: options.calendarCoverage,
      windowsInstallUpgradeRollbackSmoke: "passed",
    },
    latestCloudMigration: latestCloudMigration(options.workspaceRoot),
    knownLimitations: [
      "第三方插件代码执行保持关闭。",
      "邮件 Outbox 为至少一次交付，SMTP 接收后、数据库确认前崩溃仍可能产生重复邮件。",
      "崩溃数据仅保存在本地，不提供远程崩溃遥测。",
      "本轮不提供自动更新服务。",
      "命中敏感模式或超过大小限制的 minidump 不会进入导出的诊断包。",
    ],
    rollback: [
      "停止并卸载当前版本，但保留 Electron userData 目录。",
      "使用本次演练验证过的上一版本安装包重新安装。",
      "启动上一版本并检查 DuckDB 缓存可读、认证状态和核心工作台。",
      "云端仅回滚应用版本；本轮数据库迁移必须保持向后兼容，不执行破坏性降级。",
    ],
  };
  const jsonPath = join(options.releaseDirectory, "release-report.json");
  const markdownPath = join(options.releaseDirectory, "release-report.md");
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderReleaseReport(report), "utf8");
  return { report, jsonPath, markdownPath };
}

function renderReleaseReport(report) {
  return `# Windows x64 发布报告

- 版本：${report.version}
- Git revision：${report.revision}
- 生成时间：${report.generatedAt}
- 安装包：${report.artifact.fileName}
- 安装包 SHA-256：\`${report.artifact.sha256}\`
- 安装包签名：${report.artifact.authenticode.Status}
- 应用签名：${report.packagedApplication.authenticode.Status}
- 最新云端迁移：${report.latestCloudMigration}

## 门禁结果

- quality：${report.verification.quality}
- 完整测试（含 PostgreSQL 集成）：${report.verification.tests}
- npm 官方 registry audit：${report.verification.audit}
- Windows 干净安装/升级/卸载重装/回滚演练：${report.verification.windowsInstallUpgradeRollbackSmoke}
- 交易日历覆盖：${report.verification.calendarCoverage.join("；")}

## 已知限制

${report.knownLimitations.map((item) => `- ${item}`).join("\n")}

## 回滚步骤

${report.rollback.map((item, index) => `${index + 1}. ${item}`).join("\n")}
`;
}
