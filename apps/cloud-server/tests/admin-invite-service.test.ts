import assert from "node:assert/strict";
import test from "node:test";

import {
  AdminInviteService,
  type AdminInviteRepository,
} from "../src/services/adminInviteService.ts";

const now = new Date("2026-07-31T07:00:00.000Z");

function createRepository(
  overrides: Partial<AdminInviteRepository> = {},
): AdminInviteRepository {
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
  let persisted:
    | Parameters<AdminInviteRepository["createBatch"]>[0]
    | undefined;
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
        Buffer.isBuffer(code.codeDigest) &&
        !("plaintextCode" in code) &&
        !("inviteCode" in code),
    ),
    true,
  );
  assert.equal(
    result.codes.every((code) =>
      /^QLD-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(
        code.inviteCode,
      ),
    ),
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
