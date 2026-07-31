import { loadInviteCliConfig } from "../config.ts";
import { createDatabasePool } from "../db/pool.ts";
import { PgInviteBatchRepository } from "../repositories/pgInviteBatchRepository.ts";
import { verifyInviteCodeForBatch } from "../services/inviteBatchService.ts";
import { assertUuid, readRequiredOption } from "./cliSupport.ts";

async function readInviteCodeFromStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 256) {
      throw new Error("invite code input is too long");
    }
  }
  if (!value.trim()) {
    throw new Error("invite code must be provided on standard input");
  }
  return value;
}

async function main(): Promise<void> {
  const batchId = readRequiredOption(process.argv.slice(2), "--batch-id");
  assertUuid(batchId, "batch ID");
  const config = loadInviteCliConfig();
  const pool = createDatabasePool(config.databaseUrl);

  try {
    const result = await verifyInviteCodeForBatch({
      batchId,
      rawInviteCode: await readInviteCodeFromStdin(),
      pepper: config.inviteCodePepper,
      now: new Date(),
      repository: new PgInviteBatchRepository(pool),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`invite batch verification failed: ${message}\n`);
  process.exitCode = 1;
});
