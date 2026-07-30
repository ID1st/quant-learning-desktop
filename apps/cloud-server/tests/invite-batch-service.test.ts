import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createInviteBatchExport,
  type InviteBatchRepository,
} from "../src/services/inviteBatchService.ts";

test("batch creation persists only digests and writes plaintext to a restricted CSV", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "quant-invites-"));
  const persisted: Parameters<InviteBatchRepository["createBatch"]>[0][] = [];
  const repository: InviteBatchRepository = {
    createBatch: async (input) => {
      persisted.push(input);
    },
  };

  const result = await createInviteBatchExport({
    argumentsList: ["--spec", "7=2,30=1", "--claim-days", "30"],
    createdBy: "test-suite",
    now: new Date("2026-07-28T00:00:00.000Z"),
    outputDirectory,
    pepper: "test-pepper-that-is-never-logged",
    repository,
  });

  assert.equal(result.totalCount, 3);
  assert.match(result.batchId, /^[0-9a-f-]{36}$/);
  assert.match(result.checksumSha256, /^[0-9a-f]{64}$/);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.codes.length, 3);
  assert.equal(
    persisted[0]?.codes.every(
      (code) => Buffer.isBuffer(code.codeDigest) && !("plaintext" in code),
    ),
    true,
  );

  const csv = await readFile(result.filePath, "utf8");
  assert.match(csv, /^batch_id,invite_code,duration_days,claim_expires_at/m);
  assert.equal(csv.trim().split("\n").length, 4);
  assert.equal(
    persisted[0]?.codes.some((persistedCode) =>
      csv.includes(persistedCode.codeDigest.toString("hex")),
    ),
    false,
  );

  if (process.platform !== "win32") {
    const fileStats = await stat(result.filePath);
    assert.equal(fileStats.mode & 0o777, 0o600);
  }
});

test("failed persistence never leaves a plaintext export behind", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "quant-invites-"));
  const repository: InviteBatchRepository = {
    createBatch: async () => {
      throw new Error("database unavailable");
    },
  };

  await assert.rejects(
    () =>
      createInviteBatchExport({
        argumentsList: ["--duration-days", "30", "--count", "2"],
        createdBy: "test-suite",
        now: new Date("2026-07-28T00:00:00.000Z"),
        outputDirectory,
        pepper: "test-pepper-that-is-never-logged",
        repository,
      }),
    /database unavailable/,
  );
});
