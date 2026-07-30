import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PostgresMigrationChecksumError,
  runPostgresMigrations,
  type PostgresMigrationClient,
} from "../src/db/migrationRunner.ts";

class FakeMigrationClient implements PostgresMigrationClient {
  readonly applied = new Map<number, { name: string; checksum: string }>();
  readonly statements: string[] = [];
  private transactionApplied:
    | { version: number; name: string; checksum: string }
    | undefined;

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<{ rows: T[] }> {
    const normalized = sql.trim();
    this.statements.push(normalized);
    if (normalized === "BEGIN" || normalized === "COMMIT") {
      if (normalized === "COMMIT" && this.transactionApplied) {
        this.applied.set(this.transactionApplied.version, {
          name: this.transactionApplied.name,
          checksum: this.transactionApplied.checksum,
        });
        this.transactionApplied = undefined;
      }
      return { rows: [] };
    }
    if (normalized === "ROLLBACK") {
      this.transactionApplied = undefined;
      return { rows: [] };
    }
    if (normalized.includes("SELECT version, name, checksum")) {
      return {
        rows: Array.from(this.applied, ([version, migration]) => ({
          version,
          ...migration,
        })) as T[],
      };
    }
    if (normalized.includes("INSERT INTO schema_migrations")) {
      this.transactionApplied = {
        version: Number(values[0]),
        name: String(values[1]),
        checksum: String(values[2]),
      };
      return { rows: [] };
    }
    if (normalized.includes("FAIL_MIGRATION")) {
      throw new Error("simulated migration failure");
    }
    return { rows: [] };
  }
}

test("migration runner applies files in order and repeated execution is empty", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-migrations-"));
  try {
    await writeFile(join(directory, "002_second.sql"), "SELECT 2;\n");
    await writeFile(
      join(directory, "001_baseline.sql"),
      "BEGIN;\nSELECT 1;\nCOMMIT;\n",
    );
    const client = new FakeMigrationClient();

    const first = await runPostgresMigrations({ client, directory });
    const second = await runPostgresMigrations({ client, directory });

    assert.deepEqual(
      first.applied.map((migration) => migration.version),
      [1, 2],
    );
    assert.deepEqual(second.applied, []);
    assert.equal(first.latestVersion, 2);
    assert.equal(client.applied.size, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migration runner fails immediately when an applied checksum changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-migrations-"));
  try {
    const migrationPath = join(directory, "001_baseline.sql");
    await writeFile(migrationPath, "SELECT 1;\n");
    const client = new FakeMigrationClient();
    await runPostgresMigrations({ client, directory });
    await writeFile(migrationPath, "SELECT 2;\n");

    await assert.rejects(
      runPostgresMigrations({ client, directory }),
      PostgresMigrationChecksumError,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migration runner keeps earlier transactions when a later migration fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quant-migrations-"));
  try {
    await writeFile(join(directory, "001_baseline.sql"), "SELECT 1;\n");
    await writeFile(
      join(directory, "002_broken.sql"),
      "SELECT 'FAIL_MIGRATION';\n",
    );
    const client = new FakeMigrationClient();

    await assert.rejects(
      runPostgresMigrations({ client, directory }),
      /simulated migration failure/u,
    );
    assert.deepEqual([...client.applied.keys()], [1]);
    assert.equal(
      client.statements.filter((statement) => statement === "ROLLBACK").length,
      1,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
