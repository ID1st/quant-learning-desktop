import { loadInviteCliConfig } from "../config.ts";
import { createDatabasePool } from "../db/pool.ts";
import { PgInviteBatchRepository } from "../repositories/pgInviteBatchRepository.ts";
import {
  cleanupExpiredInviteExports,
  createInviteBatchExport,
} from "../services/inviteBatchService.ts";
import { assertRootInviteExportAccess } from "./cliSupport.ts";

async function main(): Promise<void> {
  assertRootInviteExportAccess();
  const config = loadInviteCliConfig();
  const pool = createDatabasePool(config.databaseUrl);

  try {
    await cleanupExpiredInviteExports(config.inviteExportDirectory, new Date());
    const result = await createInviteBatchExport({
      argumentsList: process.argv.slice(2),
      createdBy: process.env.SUDO_USER?.trim() || "root",
      now: new Date(),
      outputDirectory: config.inviteExportDirectory,
      pepper: config.inviteCodePepper,
      repository: new PgInviteBatchRepository(pool),
    });

    process.stdout.write(
      `${JSON.stringify({
        batchId: result.batchId,
        count: result.totalCount,
        filePath: result.filePath,
        checksumSha256: result.checksumSha256,
      })}\n`,
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`invite batch creation failed: ${message}\n`);
  process.exitCode = 1;
});
