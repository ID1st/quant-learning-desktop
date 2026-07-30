import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requestedDomains = new Set(process.argv.slice(2));
const domains = [
  {
    id: "desktop",
    testDirectory: "apps/desktop/tests",
    include: ["apps/desktop/src/**/*.ts", "apps/desktop/src/**/*.tsx"],
    thresholds: { lines: 70, branches: 72, functions: 74 },
  },
  {
    id: "cloud",
    testDirectory: "apps/cloud-server/tests",
    include: ["apps/cloud-server/src/**/*.ts"],
    thresholds: { lines: 52, branches: 70, functions: 54 },
  },
  {
    id: "api-client",
    testDirectory: "packages/api-client/tests",
    include: ["packages/api-client/src/**/*.ts"],
    thresholds: { lines: 80, branches: 70, functions: 65 },
  },
  {
    id: "chart",
    testDirectory: "packages/chart/tests",
    include: ["packages/chart/src/**/*.ts", "packages/chart/src/**/*.tsx"],
    thresholds: { lines: 95, branches: 80, functions: 90 },
  },
  {
    id: "pine-runtime",
    testDirectory: "packages/pine-runtime/tests",
    include: ["packages/pine-runtime/src/**/*.ts"],
    thresholds: { lines: 95, branches: 92, functions: 98 },
  },
  {
    id: "plugin-loader",
    testDirectory: "packages/plugin-loader/tests",
    include: ["packages/plugin-loader/src/**/*.ts"],
    thresholds: { lines: 90, branches: 65, functions: 95 },
  },
  {
    id: "strategy-engine",
    testDirectory: "packages/strategy-engine/tests",
    include: ["packages/strategy-engine/src/**/*.ts"],
    thresholds: { lines: 92, branches: 85, functions: 93 },
  },
  {
    id: "critical-auth",
    testDirectory: "apps/desktop/tests",
    testFiles: ["auth-session-manager.test.ts"],
    include: ["apps/desktop/src/electron/authSessionManager.ts"],
    thresholds: { lines: 90, branches: 85 },
  },
  {
    id: "critical-calendar",
    testDirectory: "apps/desktop/tests",
    testFiles: [
      "intraday-history-service.test.ts",
      "market-data-runtime-status.test.ts",
      "strategy-series.test.ts",
    ],
    include: ["apps/desktop/src/features/marketData/marketCalendar.ts"],
    thresholds: { lines: 90, branches: 85 },
  },
  {
    id: "critical-duckdb",
    testDirectory: "apps/desktop/tests",
    testFiles: ["duckdb-market-bar-repository.test.ts"],
    include: ["apps/desktop/src/electron/duckDbMarketBarRepository.ts"],
    thresholds: { lines: 90, branches: 85 },
  },
  {
    id: "critical-migrations",
    testDirectory: "apps/cloud-server/tests",
    testFiles: ["migration-runner.test.ts"],
    include: ["apps/cloud-server/src/db/migrationRunner.ts"],
    thresholds: { lines: 90, branches: 85 },
  },
  {
    id: "critical-outbox",
    testDirectory: "apps/cloud-server/tests",
    testFiles: ["email-outbox-worker.test.ts"],
    include: ["apps/cloud-server/src/services/emailOutboxWorker.ts"],
    thresholds: { lines: 90, branches: 85 },
  },
];

const selectedDomains = requestedDomains.size
  ? domains.filter((domain) => requestedDomains.has(domain.id))
  : domains;

if (
  selectedDomains.length === 0 ||
  (requestedDomains.size > 0 && selectedDomains.length !== requestedDomains.size)
) {
  const known = domains.map((domain) => domain.id).join(", ");
  throw new Error(`Unknown coverage domain. Expected one or more of: ${known}`);
}

for (const domain of selectedDomains) {
  const tests = readdirSync(resolve(root, domain.testDirectory))
    .filter((name) =>
      domain.testFiles ? domain.testFiles.includes(name) : name.endsWith(".test.ts"),
    )
    .sort()
    .map((name) => resolve(root, domain.testDirectory, name));
  const coverageArguments = [
    "--test",
    "--test-reporter=dot",
    "--experimental-strip-types",
    "--experimental-test-coverage",
    ...domain.include.flatMap((pattern) => [`--test-coverage-include=${pattern}`]),
    `--test-coverage-lines=${domain.thresholds.lines}`,
    `--test-coverage-branches=${domain.thresholds.branches}`,
    ...(domain.thresholds.functions === undefined
      ? []
      : [`--test-coverage-functions=${domain.thresholds.functions}`]),
    ...tests,
  ];

  const functionThreshold =
    domain.thresholds.functions === undefined ? "" : `, functions ${domain.thresholds.functions}%`;
  console.info(
    `Coverage ${domain.id}: lines ${domain.thresholds.lines}%, branches ${domain.thresholds.branches}%${functionThreshold}`,
  );
  const result = spawnSync(process.execPath, coverageArguments, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    console.error(
      `Coverage threshold failed for ${domain.id}; rerunning with the spec reporter for diagnostics.`,
    );
    const diagnosticResult = spawnSync(
      process.execPath,
      coverageArguments.map((argument) =>
        argument === "--test-reporter=dot" ? "--test-reporter=spec" : argument,
      ),
      {
        cwd: root,
        stdio: "inherit",
      },
    );
    process.exit(diagnosticResult.status ?? result.status ?? 1);
  }
}
