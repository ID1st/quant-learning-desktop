import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminInviteService,
  type AdminInviteRepository,
} from "../src/services/adminInviteService.ts";

const now = new Date("2026-07-31T07:00:00.000Z");

test("request IDs determine batch identity and malformed keys are rejected", async () => {
  const service = new AdminInviteService({ pepper: "test", repository: createRepository() });
  const requestId = "35d7c9b9-5eb1-4b09-813c-c25c191af3f8";
  const input = { entries: [{ durationDays: 7 as const, count: 1 }], claimDays: 7 };
  assert.equal(
    (await service.createBatch(input, "admin@example.test", now, { requestId, sourceIp: null }))
      .batch.batchId,
    requestId,
  );
  await assert.rejects(
    service.createBatch(input, "admin@example.test", now, { requestId: "invalid", sourceIp: null }),
    /UUID/,
  );
});

function createRepository(overrides: Partial<AdminInviteRepository> = {}): AdminInviteRepository {
  return {
    createBatch: async () => undefined,
    listBatches: async () => ({
      items: [],
      totalItems: 0,
    }),
    revokeBatch: async () => null,
    ...overrides,
  };
}

test("web batch creation returns plaintext once while persisting only digests", async () => {
  let persisted: Parameters<AdminInviteRepository["createBatch"]>[0] | undefined;
  const service = new AdminInviteService({
    pepper: "invite-code-pepper-at-least-32-bytes",
    repository: createRepository({
      createBatch: async (input) => {
        persisted = input;
      },
    }),
  });

  const result = await service.createBatch(
    {
      entries: [
        { durationDays: 7, count: 2 },
        { durationDays: 30, count: 1 },
      ],
      claimDays: 30,
    },
    "admin@example.com",
    now,
  );

  assert.equal(result.codes.length, 3);
  assert.equal(result.batch.totalCount, 3);
  assert.equal(result.batch.activeCount, 3);
  assert.equal(result.batch.status, "ACTIVE");
  assert.equal(persisted?.codes.length, 3);
  assert.equal(
    persisted?.codes.every(
      (code) =>
        Buffer.isBuffer(code.codeDigest) && !("plaintextCode" in code) && !("inviteCode" in code),
    ),
    true,
  );
  assert.equal(
    result.codes.every((code) => /^QLD-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code.inviteCode)),
    true,
  );
});

test("web batch creation rejects duplicate tiers and totals above five hundred", async () => {
  const service = new AdminInviteService({
    pepper: "invite-code-pepper-at-least-32-bytes",
    repository: createRepository(),
  });

  await assert.rejects(
    service.createBatch(
      {
        entries: [
          { durationDays: 7, count: 1 },
          { durationDays: 7, count: 1 },
        ],
        claimDays: 30,
      },
      "admin@example.com",
      now,
    ),
    /duration tier must be unique/u,
  );
  await assert.rejects(
    service.createBatch(
      {
        entries: [
          { durationDays: 90, count: 300 },
          { durationDays: 365, count: 201 },
        ],
        claimDays: 30,
      },
      "admin@example.com",
      now,
    ),
    /cannot contain more than 500/u,
  );
});

test("web batch creation enforces claim, tier and count boundaries", async () => {
  const service = new AdminInviteService({
    pepper: "invite-code-pepper-at-least-32-bytes",
    repository: createRepository(),
  });
  const create = (entries: Array<{ durationDays: 7; count: number }>, claimDays: number) =>
    service.createBatch({ entries, claimDays }, "admin@example.com", now);

  await assert.rejects(create([{ durationDays: 7, count: 1 }], 0), /claim days/u);
  await assert.rejects(create([], 30), /between one and four/u);
  await assert.rejects(create([{ durationDays: 7, count: 0 }], 30), /count must be/u);
  await assert.rejects(
    service.createBatch(
      {
        entries: [{ durationDays: 14 as 7, count: 1 }],
        claimDays: 30,
      },
      "admin@example.com",
      now,
    ),
    /duration must be/u,
  );
});

test("batch history validates pagination and revocation reports missing batches", async () => {
  const activeBatch = {
    batchId: "5047a4b6-a720-4edc-b1ba-1f7487b8d528",
    status: "ACTIVE" as const,
    totalCount: 1,
    activeCount: 1,
    redeemedCount: 0,
    revokedCount: 0,
    claimExpiresAt: "2026-08-30T07:00:00.000Z",
    createdAt: now.toISOString(),
    revokedAt: null,
  };
  const service = new AdminInviteService({
    pepper: "invite-code-pepper-at-least-32-bytes",
    repository: createRepository({
      listBatches: async () => ({ items: [activeBatch], totalItems: 1 }),
      revokeBatch: async (batchId) => (batchId === activeBatch.batchId ? activeBatch : null),
    }),
  });

  assert.equal((await service.listBatches(1, 20)).totalItems, 1);
  await assert.rejects(service.listBatches(0, 20), /positive integer/u);
  await assert.rejects(service.listBatches(1, 101), /page size/u);
  assert.equal((await service.revokeBatch(activeBatch.batchId, now)).batchId, activeBatch.batchId);
  await assert.rejects(
    service.revokeBatch("00000000-0000-0000-0000-000000000000", now),
    /not found/u,
  );
});
