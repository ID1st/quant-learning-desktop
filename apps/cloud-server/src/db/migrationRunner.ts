import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface PostgresMigrationClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface PostgresMigration {
  version: number;
  name: string;
  checksum: string;
  path: string;
  sql: string;
}

export interface RunPostgresMigrationsOptions {
  client: PostgresMigrationClient;
  directory: string;
}

export class PostgresMigrationChecksumError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(`Applied migration ${version} has a different checksum.`);
    this.name = "PostgresMigrationChecksumError";
    this.version = version;
  }
}

function checksum(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function stripTransactionEnvelope(sql: string) {
  const match = sql.match(/^\s*BEGIN\s*;\s*([\s\S]*?)\s*COMMIT\s*;\s*$/iu);
  return match?.[1] ?? sql;
}

export async function readPostgresMigrations(directory: string) {
  const filenames = (await readdir(directory))
    .filter((filename) => /^\d+_[a-z0-9][a-z0-9_-]*\.sql$/iu.test(filename))
    .sort((left, right) => left.localeCompare(right));
  const migrations: PostgresMigration[] = [];
  const versions = new Set<number>();

  for (const filename of filenames) {
    const version = Number.parseInt(filename.split("_", 1)[0]!, 10);
    if (!Number.isSafeInteger(version) || versions.has(version)) {
      throw new Error(`Migration version is invalid or duplicated: ${filename}`);
    }
    versions.add(version);
    const path = join(directory, filename);
    const sql = await readFile(path, "utf8");
    migrations.push({
      version,
      name: filename,
      checksum: checksum(sql),
      path,
      sql,
    });
  }

  if (migrations.length === 0) {
    throw new Error(`No PostgreSQL migration files found in ${directory}.`);
  }
  return migrations;
}

export async function runPostgresMigrations(
  options: RunPostgresMigrationsOptions,
) {
  const migrations = await readPostgresMigrations(options.directory);
  await options.client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT schema_migrations_version_check CHECK (version > 0),
      CONSTRAINT schema_migrations_checksum_check
        CHECK (checksum ~ '^[0-9a-f]{64}$')
    )
  `);
  await options.client.query(
    "SELECT pg_advisory_lock(hashtext('quant-auth-schema-migrations'))",
  );

  const appliedNow: PostgresMigration[] = [];
  try {
    const result = await options.client.query<{
      version: number;
      name: string;
      checksum: string;
    }>(
      "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
    );
    const applied = new Map(
      result.rows.map((row) => [
        Number(row.version),
        { name: row.name, checksum: row.checksum.trim() },
      ]),
    );

    for (const [version, existing] of applied) {
      const migration = migrations.find((candidate) => candidate.version === version);
      if (!migration) {
        throw new Error(
          `Applied migration ${version} (${existing.name}) is missing from the release.`,
        );
      }
      if (migration.checksum !== existing.checksum) {
        throw new PostgresMigrationChecksumError(version);
      }
    }

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        continue;
      }
      await options.client.query("BEGIN");
      try {
        await options.client.query(stripTransactionEnvelope(migration.sql));
        await options.client.query(
          `INSERT INTO schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await options.client.query("COMMIT");
        appliedNow.push(migration);
      } catch (error) {
        await options.client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await options.client.query(
      "SELECT pg_advisory_unlock(hashtext('quant-auth-schema-migrations'))",
    );
  }

  return {
    discovered: migrations.map(({ version, name, checksum: migrationChecksum }) => ({
      version,
      name,
      checksum: migrationChecksum,
    })),
    applied: appliedNow.map(({ version, name, checksum: migrationChecksum }) => ({
      version,
      name,
      checksum: migrationChecksum,
    })),
    latestVersion: migrations.at(-1)!.version,
  };
}
