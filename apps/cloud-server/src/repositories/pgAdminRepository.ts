import type { Pool, PoolClient } from "pg";

import type {
  AdminProvisionRepository,
  AdminProvisionResult,
} from "../services/adminService.ts";

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class PgAdminRepository implements AdminProvisionRepository {
  public constructor(private readonly pool: Pool) {}

  public async provisionAccount(
    email: string,
    now: Date,
  ): Promise<AdminProvisionResult | "CONFLICT"> {
    return withTransaction(this.pool, async (client) => {
      await client.query("LOCK TABLE admin_accounts IN EXCLUSIVE MODE");
      const existing = await client.query<{ email: string }>(
        "SELECT email FROM admin_accounts LIMIT 1",
      );
      const currentEmail = existing.rows[0]?.email;
      if (currentEmail) {
        return currentEmail === email ? "EXISTING" : "CONFLICT";
      }

      await client.query(
        `
          INSERT INTO admin_accounts (email, created_at, updated_at)
          VALUES ($1, $2, $2)
        `,
        [email, now],
      );
      return "CREATED";
    });
  }
}
