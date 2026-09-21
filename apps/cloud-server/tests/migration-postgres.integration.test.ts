import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import {
  PostgresMigrationChecksumError,
  runPostgresMigrations,
  type PostgresMigrationClient,
} from "../src/db/migrationRunner.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationsDirectory = fileURLToPath(new URL("../migrations", import.meta.url));

function migrationClient(client: PoolClient): PostgresMigrationClient {
  return {
    async query(sql, values) {
      const result = await client.query(sql, values);
      return { rows: result.rows };
    },
  };
}

async function withIsolatedSchema(pool: Pool, callback: (client: PoolClient) => Promise<void>) {
  const schema = `migration_${randomUUID().replaceAll("-", "_")}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await callback(client);
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
  }
}

test(
  "PostgreSQL migration runner covers fresh, existing-001, repeat, checksum and failure recovery",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await withIsolatedSchema(pool, async (client) => {
        const first = await runPostgresMigrations({
          client: migrationClient(client),
          directory: migrationsDirectory,
        });
        const repeated = await runPostgresMigrations({
          client: migrationClient(client),
          directory: migrationsDirectory,
        });
        assert.deepEqual(
          first.applied.map((migration) => migration.version),
          [1, 2, 3],
        );
        assert.deepEqual(repeated.applied, []);
        const adminTables = await client.query(
          "SELECT to_regclass('admin_accounts') AS users, to_regclass('admin_sessions') AS sessions",
        );
        assert.ok(adminTables.rows[0].users);
        assert.ok(adminTables.rows[0].sessions);
        const columns = await client.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'email_outbox'`,
        );
        assert.equal(
          columns.rows.some((row) => row.column_name === "claim_token"),
          true,
        );

        await client.query("UPDATE schema_migrations SET checksum = $1 WHERE version = 1", [
          "0".repeat(64),
        ]);
        await assert.rejects(
          runPostgresMigrations({
            client: migrationClient(client),
            directory: migrationsDirectory,
          }),
          PostgresMigrationChecksumError,
        );
      });

      await withIsolatedSchema(pool, async (client) => {
        const baseline = await readFile(join(migrationsDirectory, "001_auth_schema.sql"), "utf8");
        await client.query(baseline);
        const result = await runPostgresMigrations({
          client: migrationClient(client),
          directory: migrationsDirectory,
        });
        assert.deepEqual(
          result.applied.map((migration) => migration.version),
          [1, 2, 3],
        );
      });

      await withIsolatedSchema(pool, async (client) => {
        const directory = await mkdtemp(join(tmpdir(), "quant-pg-migrations-"));
        try {
          await writeFile(
            join(directory, "001_baseline.sql"),
            await readFile(join(migrationsDirectory, "001_auth_schema.sql"), "utf8"),
          );
          await writeFile(join(directory, "002_broken.sql"), "CREATE TABLE broken (\n");
          await assert.rejects(
            runPostgresMigrations({
              client: migrationClient(client),
              directory,
            }),
          );
          const applied = await client.query<{ version: number }>(
            "SELECT version FROM schema_migrations ORDER BY version",
          );
          assert.deepEqual(
            applied.rows.map((row) => row.version),
            [1],
          );
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      });
    } finally {
      await pool.end();
    }
  },
);
