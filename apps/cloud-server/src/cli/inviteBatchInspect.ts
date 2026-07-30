import { loadInviteCliConfig } from "../config.ts";
import { createDatabasePool } from "../db/pool.ts";
import { PgInviteBatchRepository } from "../repositories/pgInviteBatchRepository.ts";
import { assertUuid, readRequiredOption } from "./cliSupport.ts";

async function main(): Promise<void> {
  const batchId = readRequiredOption(process.argv.slice(2), "--batch-id");
  assertUuid(batchId, "batch ID");
  const config = loadInviteCliConfig();
  const pool = createDatabasePool(config.databaseUrl);

  try {
    const status = await new PgInviteBatchRepository(pool).inspectBatch(
      batchId,
    );
    if (!status) {
      throw new Error("invite batch was not found");
    }
    process.stdout.write(`${JSON.stringify(status)}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`invite batch inspection failed: ${message}\n`);
  process.exitCode = 1;
});
