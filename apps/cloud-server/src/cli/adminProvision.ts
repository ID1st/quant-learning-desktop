import { loadAdminProvisionConfig } from "../config.ts";
import { createDatabasePool } from "../db/pool.ts";
import { PgAdminRepository } from "../repositories/pgAdminRepository.ts";
import { provisionAdminAccount } from "../services/adminService.ts";

async function main(): Promise<void> {
  const config = loadAdminProvisionConfig();
  const pool = createDatabasePool(config.databaseUrl);
  try {
    const status = await provisionAdminAccount(
      new PgAdminRepository(pool),
      config.adminEmail,
    );
    process.stdout.write(`${JSON.stringify({ status })}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`admin provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
