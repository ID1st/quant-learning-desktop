import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabasePool } from "../db/pool.ts";
import { latestPostgresMigrationVersion } from "../db/migrationVersion.ts";
import { runPostgresMigrations, type PostgresMigrationClient } from "../db/migrationRunner.ts";

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const configuredDirectory = process.env.MIGRATIONS_DIRECTORY?.trim();
  const directory = configuredDirectory
    ? resolve(configuredDirectory)
    : fileURLToPath(new URL("../../migrations", import.meta.url));
  const pool = createDatabasePool(databaseUrl);
  const client = await pool.connect();
  try {
    const migrationClient: PostgresMigrationClient = {
      async query(sql, values) {
        const result = await client.query(sql, values);
        return { rows: result.rows };
      },
    };
    const result = await runPostgresMigrations({
      client: migrationClient,
      directory,
    });
    if (result.latestVersion !== latestPostgresMigrationVersion) {
      throw new Error("Bundled migration version does not match server readiness.");
    }
    process.stdout.write(
      `${JSON.stringify({
        latestVersion: result.latestVersion,
        appliedVersions: result.applied.map((migration) => migration.version),
      })}\n`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const errorCode =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]+$/u.test(error.name)
      ? error.name
      : "MigrationError";
  process.stderr.write(`PostgreSQL migration failed: ${errorCode}\n`);
  process.exitCode = 1;
});
