import type { Pool, PoolClient } from "pg";

import type {
  CreateInviteBatchRecord,
  InviteBatchRepository,
} from "../services/inviteBatchService.ts";

export interface InviteBatchStatus {
  batchId: string;
  status: "ACTIVE" | "REVOKED";
  totalCount: number;
  activeCount: number;
  redeemedCount: number;
  revokedCount: number;
  claimExpiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

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

export class PgInviteBatchRepository implements InviteBatchRepository {
  private readonly pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

  public async createBatch(input: CreateInviteBatchRecord): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `
          INSERT INTO invite_batches (
            id,
            claim_expires_at,
            total_count,
            created_by,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          input.batchId,
          input.claimExpiresAt,
          input.codes.length,
          input.createdBy,
          input.createdAt,
        ],
      );

      await client.query(
        `
          INSERT INTO invite_codes (
            batch_id,
            code_digest,
            duration_days,
            claim_expires_at,
            created_at
          )
          SELECT $1, code_digest, duration_days, claim_expires_at, $5
          FROM unnest(
            $2::bytea[],
            $3::smallint[],
            $4::timestamptz[]
          ) AS generated(code_digest, duration_days, claim_expires_at)
        `,
        [
          input.batchId,
          input.codes.map((code) => code.codeDigest),
          input.codes.map((code) => code.durationDays),
          input.codes.map((code) => code.claimExpiresAt),
          input.createdAt,
        ],
      );
    });
  }

  public async inspectBatch(batchId: string): Promise<InviteBatchStatus | null> {
    const result = await this.pool.query<{
      batch_id: string;
      status: "ACTIVE" | "REVOKED";
      total_count: number;
      active_count: number;
      redeemed_count: number;
      revoked_count: number;
      claim_expires_at: Date;
      created_at: Date;
      revoked_at: Date | null;
    }>(
      `
        SELECT
          batch.id AS batch_id,
          batch.status,
          batch.total_count,
          count(*) FILTER (WHERE code.status = 'ACTIVE')::int AS active_count,
          count(*) FILTER (WHERE code.status = 'REDEEMED')::int AS redeemed_count,
          count(*) FILTER (WHERE code.status = 'REVOKED')::int AS revoked_count,
          batch.claim_expires_at,
          batch.created_at,
          batch.revoked_at
        FROM invite_batches AS batch
        JOIN invite_codes AS code ON code.batch_id = batch.id
        WHERE batch.id = $1
        GROUP BY batch.id
      `,
      [batchId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      batchId: row.batch_id,
      status: row.status,
      totalCount: row.total_count,
      activeCount: row.active_count,
      redeemedCount: row.redeemed_count,
      revokedCount: row.revoked_count,
      claimExpiresAt: row.claim_expires_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      revokedAt: row.revoked_at?.toISOString() ?? null,
    };
  }

  public async revokeBatch(
    batchId: string,
    now: Date,
  ): Promise<InviteBatchStatus | null> {
    await withTransaction(this.pool, async (client) => {
      const batchResult = await client.query(
        `
          UPDATE invite_batches
          SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, $2)
          WHERE id = $1
        `,
        [batchId, now],
      );
      if (batchResult.rowCount === 0) {
        return;
      }

      await client.query(
        `
          UPDATE invite_codes
          SET status = 'REVOKED', revoked_at = $2
          WHERE batch_id = $1 AND status = 'ACTIVE'
        `,
        [batchId, now],
      );
    });

    return this.inspectBatch(batchId);
  }
}
