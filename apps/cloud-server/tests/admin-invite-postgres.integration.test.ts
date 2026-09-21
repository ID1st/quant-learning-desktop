import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Pool } from "pg";
import { runPostgresMigrations } from "../src/db/migrationRunner.ts";
import { PgInviteBatchRepository } from "../src/repositories/pgInviteBatchRepository.ts";
import { InviteBatchConflictError } from "../src/services/inviteBatchService.ts";

test(
  "PostgreSQL batch creation and revocation remain atomic with audits and concurrent retries",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = `admin_test_${randomUUID().replaceAll("-", "_")}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);
      await runPostgresMigrations({
        client,
        directory: fileURLToPath(new URL("../migrations", import.meta.url)),
      });
      const scopedPool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schema},public`,
      });
      try {
        const repository = new PgInviteBatchRepository(scopedPool);
        const now = new Date();
        const input = {
          batchId: randomUUID(),
          createdBy: "audit@example.test",
          createdAt: now,
          claimExpiresAt: new Date(now.getTime() + 86400000),
          codes: [
            {
              codeDigest: Buffer.alloc(32, 7),
              durationDays: 7 as const,
              claimExpiresAt: new Date(now.getTime() + 86400000),
            },
          ],
          auditSourceIp: null,
        };
        await client.query(
          "CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$",
        );
        await client.query(
          "CREATE TRIGGER fail_audit BEFORE INSERT ON auth_audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit()",
        );
        await assert.rejects(repository.createBatch(input), /injected audit failure/);
        assert.equal(
          (await client.query("SELECT count(*)::int AS n FROM invite_batches")).rows[0].n,
          0,
        );
        await client.query("DROP TRIGGER fail_audit ON auth_audit_events");
        const results = await Promise.allSettled([
          repository.createBatch(input),
          repository.createBatch(input),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.ok(
          results.some(
            (r) => r.status === "rejected" && r.reason instanceof InviteBatchConflictError,
          ),
        );
        assert.equal(
          (await client.query("SELECT count(*)::int AS n FROM auth_audit_events")).rows[0].n,
          1,
        );
        await client.query(
          "CREATE TRIGGER fail_audit BEFORE INSERT ON auth_audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit()",
        );
        await assert.rejects(
          repository.revokeBatch(input.batchId, now, { email: input.createdBy, sourceIp: null }),
          /injected audit failure/,
        );
        assert.equal((await repository.inspectBatch(input.batchId))?.status, "ACTIVE");
        await client.query("DROP TRIGGER fail_audit ON auth_audit_events");
        assert.equal(
          (
            await repository.revokeBatch(input.batchId, now, {
              email: input.createdBy,
              sourceIp: null,
            })
          )?.status,
          "REVOKED",
        );
        assert.equal(
          (await client.query("SELECT count(*)::int AS n FROM auth_audit_events")).rows[0].n,
          2,
        );
      } finally {
        await scopedPool.end();
      }
    } finally {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
