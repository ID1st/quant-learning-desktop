import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PgInviteBatchRepository } from "../src/repositories/pgInviteBatchRepository.ts";
import { InviteBatchConflictError } from "../src/services/inviteBatchService.ts";

const input = {
  batchId: "35d7c9b9-5eb1-4b09-813c-c25c191af3f8",
  createdBy: "admin@example.test",
  createdAt: new Date(),
  claimExpiresAt: new Date(),
  codes: [{ codeDigest: Buffer.alloc(32), durationDays: 7 as const, claimExpiresAt: new Date() }],
  auditSourceIp: null,
};
function fixture(failAudit = false, duplicate = false) {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (failAudit && sql.includes("INSERT INTO auth_audit_events"))
        throw new Error("audit unavailable");
      return {
        rowCount: duplicate && sql.includes("INSERT INTO invite_batches") ? 0 : 1,
        rows: [{ total_count: 1 }],
      };
    },
    release: () => calls.push("RELEASE"),
  };
  const pool = {
    connect: async () => client,
    query: async () => ({ rows: [] }),
  } as unknown as Pool;
  return { calls, repository: new PgInviteBatchRepository(pool) };
}

test("batch creation rolls back when its audit cannot be persisted", async () => {
  const { calls, repository } = fixture(true);
  await assert.rejects(repository.createBatch(input), /audit unavailable/);
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.includes("COMMIT"));
  assert.equal(calls.at(-1), "RELEASE");
});
test("batch audit commits inside the same transaction and duplicate keys create nothing", async () => {
  const good = fixture();
  await good.repository.createBatch(input);
  assert.ok(
    good.calls.findIndex((c) => c.includes("INSERT INTO auth_audit_events")) <
      good.calls.indexOf("COMMIT"),
  );
  const duplicate = fixture(false, true);
  await assert.rejects(duplicate.repository.createBatch(input), InviteBatchConflictError);
  assert.ok(!duplicate.calls.some((c) => c.includes("INSERT INTO invite_codes")));
  assert.ok(duplicate.calls.includes("ROLLBACK"));
});
test("revocation audit failure rolls back revocation", async () => {
  const { calls, repository } = fixture(true);
  await assert.rejects(
    repository.revokeBatch(input.batchId, input.createdAt, {
      email: input.createdBy,
      sourceIp: null,
    }),
    /audit unavailable/,
  );
  assert.ok(calls.some((c) => c.includes("UPDATE invite_codes")));
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.includes("COMMIT"));
});
