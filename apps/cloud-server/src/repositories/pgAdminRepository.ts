import { timingSafeEqual } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type {
  AdminAccountIdentity,
  AdminProvisionRepository,
  AdminProvisionResult,
  AdminRepository,
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

function digestsEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PgAdminRepository implements AdminProvisionRepository, AdminRepository {
  private readonly pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

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

  public async createLoginChallenge(input: {
    email: string;
    codeDigest: Buffer;
    plaintextCode: string;
    expiresAt: Date;
    requestedIp: string | null;
    now: Date;
  }): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1), hashtext('ADMIN_LOGIN'))",
        [input.email],
      );
      const admin = await client.query<{ id: string }>(
        `
          SELECT id
          FROM admin_accounts
          WHERE email = $1 AND enabled = true
          FOR UPDATE
        `,
        [input.email],
      );
      const adminId = admin.rows[0]?.id;
      if (!adminId) {
        return false;
      }
      const recent = await client.query(
        `
          SELECT 1
          FROM admin_login_challenges
          WHERE admin_id = $1
            AND created_at > $2::timestamptz - interval '60 seconds'
          LIMIT 1
        `,
        [adminId, input.now],
      );
      if (recent.rowCount) {
        return false;
      }
      await client.query(
        `
          UPDATE admin_login_challenges
          SET consumed_at = $2
          WHERE admin_id = $1 AND consumed_at IS NULL
        `,
        [adminId, input.now],
      );
      await client.query(
        `
          INSERT INTO admin_login_challenges (
            admin_id, code_digest, expires_at, requested_ip, created_at
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [adminId, input.codeDigest, input.expiresAt, input.requestedIp, input.now],
      );
      await client.query(
        `
          INSERT INTO email_outbox (
            to_email, template, payload, created_at, next_attempt_at
          )
          VALUES ($1, 'admin-login-code', $2::jsonb, $3, $3)
        `,
        [
          input.email,
          JSON.stringify({
            code: input.plaintextCode,
            expiresInMinutes: 10,
          }),
          input.now,
        ],
      );
      return true;
    });
  }

  public async consumeLoginChallenge(input: {
    email: string;
    observedCodeDigest: Buffer;
    tokenDigest: Buffer;
    sessionExpiresAt: Date;
    now: Date;
  }): Promise<
    | { kind: "AUTHENTICATED"; admin: AdminAccountIdentity }
    | { kind: "INVALID" | "EXPIRED" | "DISABLED" }
  > {
    return withTransaction(this.pool, async (client) => {
      const adminResult = await client.query<{
        id: string;
        email: string;
        enabled: boolean;
      }>(
        `
          SELECT id, email, enabled
          FROM admin_accounts
          WHERE email = $1
          FOR UPDATE
        `,
        [input.email],
      );
      const admin = adminResult.rows[0];
      if (!admin || !admin.enabled) {
        return { kind: "DISABLED" };
      }
      const challengeResult = await client.query<{
        id: string;
        code_digest: Buffer;
        expires_at: Date;
        attempts: number;
        max_attempts: number;
      }>(
        `
          SELECT id, code_digest, expires_at, attempts, max_attempts
          FROM admin_login_challenges
          WHERE admin_id = $1 AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [admin.id],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge) {
        return { kind: "INVALID" };
      }
      if (challenge.expires_at.getTime() < input.now.getTime()) {
        await client.query(
          "UPDATE admin_login_challenges SET consumed_at = $2 WHERE id = $1",
          [challenge.id, input.now],
        );
        return { kind: "EXPIRED" };
      }
      if (
        challenge.attempts >= challenge.max_attempts ||
        !digestsEqual(challenge.code_digest, input.observedCodeDigest)
      ) {
        await client.query(
          `
            UPDATE admin_login_challenges
            SET
              attempts = attempts + 1,
              consumed_at = CASE
                WHEN attempts + 1 >= max_attempts THEN $2
                ELSE consumed_at
              END
            WHERE id = $1
          `,
          [challenge.id, input.now],
        );
        return { kind: "INVALID" };
      }
      await client.query(
        "UPDATE admin_login_challenges SET consumed_at = $2 WHERE id = $1",
        [challenge.id, input.now],
      );
      await client.query(
        `
          UPDATE admin_sessions
          SET revoked_at = $2, revoke_reason = 'NEW_LOGIN'
          WHERE admin_id = $1 AND revoked_at IS NULL
        `,
        [admin.id, input.now],
      );
      await client.query(
        `
          INSERT INTO admin_sessions (
            admin_id, token_digest, expires_at, last_seen_at, created_at
          )
          VALUES ($1, $2, $3, $4, $4)
        `,
        [admin.id, input.tokenDigest, input.sessionExpiresAt, input.now],
      );
      return {
        kind: "AUTHENTICATED",
        admin: { id: admin.id, email: admin.email },
      };
    });
  }

  public async findSession(
    tokenDigest: Buffer,
    now: Date,
  ): Promise<AdminAccountIdentity | null> {
    const result = await this.pool.query<AdminAccountIdentity>(
      `
        UPDATE admin_sessions AS session
        SET last_seen_at = $2
        FROM admin_accounts AS admin
        WHERE session.token_digest = $1
          AND session.admin_id = admin.id
          AND session.revoked_at IS NULL
          AND session.expires_at > $2
          AND admin.enabled = true
        RETURNING admin.id, admin.email
      `,
      [tokenDigest, now],
    );
    return result.rows[0] ?? null;
  }

  public async revokeSession(tokenDigest: Buffer, now: Date): Promise<void> {
    await this.pool.query(
      `
        UPDATE admin_sessions
        SET revoked_at = COALESCE(revoked_at, $2), revoke_reason = COALESCE(revoke_reason, 'LOGOUT')
        WHERE token_digest = $1
      `,
      [tokenDigest, now],
    );
  }

  public async recordAuditEvent(input: {
    eventType: string;
    email: string | null;
    sourceIp: string | null;
    now: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO auth_audit_events (
          email, event_type, source_ip, metadata, created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `,
      [
        input.email,
        input.eventType,
        input.sourceIp,
        JSON.stringify(input.metadata ?? {}),
        input.now,
      ],
    );
  }
}
