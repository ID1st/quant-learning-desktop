import { timingSafeEqual } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import type { EntitlementDurationDays } from "../domain/authDomain.ts";
import { calculateEntitlementPeriod } from "../domain/authDomain.ts";

export type EmailChallengePurpose = "REGISTRATION" | "PASSWORD_RESET";

export interface EntitlementRecord {
  durationDays: EntitlementDurationDays;
  startsAt: Date;
  endsAt: Date;
}

export interface LoginUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  authVersion: number;
  disabledAt: Date | null;
  entitlement: EntitlementRecord | null;
}

export interface IssuedSessionRecord {
  sessionId: string;
  activeDeviceCount: number;
}

export interface SessionIdentityRecord {
  sessionId: string;
  userId: string;
  email: string;
  deviceId: string;
  disabledAt: Date | null;
  entitlement: EntitlementRecord | null;
}

export type ChallengeConsumptionResult =
  "CONSUMED" | "INVALID" | "EXPIRED" | "USER_ALREADY_EXISTS" | "USER_NOT_FOUND";

export type InviteRedemptionResult =
  | { kind: "REDEEMED"; entitlement: EntitlementRecord }
  | { kind: "INVALID" }
  | { kind: "EXPIRED" }
  | { kind: "ALREADY_REDEEMED" };

interface CreateChallengeInput {
  email: string;
  purpose: EmailChallengePurpose;
  codeDigest: Buffer;
  plaintextCode: string;
  expiresAt: Date;
  requestedIp: string | null;
  now: Date;
}

interface IssueSessionInput {
  userId: string;
  deviceId: string;
  deviceLabel: string;
  accessTokenDigest: Buffer;
  refreshTokenDigest: Buffer;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
}

interface RotateSessionInput {
  refreshTokenDigest: Buffer;
  deviceId: string;
  nextAccessTokenDigest: Buffer;
  nextRefreshTokenDigest: Buffer;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  now: Date;
}

interface AuditEventInput {
  eventType: string;
  now: Date;
  userId?: string | null;
  email?: string | null;
  sourceIp?: string | null;
  deviceId?: string | null;
  metadata?: Record<string, unknown>;
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

function digestsEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function toEntitlement(row: {
  duration_days: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
}): EntitlementRecord | null {
  if (!row.duration_days || !row.starts_at || !row.ends_at) {
    return null;
  }
  return {
    durationDays: row.duration_days as EntitlementDurationDays,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export class PgAuthRepository {
  private readonly pool: Pool;

  public constructor(pool: Pool) {
    this.pool = pool;
  }

  public async createEmailChallenge(input: CreateChallengeInput): Promise<boolean> {
    return withTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        input.email,
        input.purpose,
      ]);
      const recentChallenge = await client.query(
        `
          SELECT 1
          FROM email_challenges
          WHERE email = $1
            AND purpose = $2
            AND created_at > $3::timestamptz - interval '60 seconds'
          LIMIT 1
        `,
        [input.email, input.purpose, input.now],
      );
      if (recentChallenge.rowCount) {
        return false;
      }

      await client.query(
        `
          UPDATE email_challenges
          SET consumed_at = $3
          WHERE email = $1
            AND purpose = $2
            AND consumed_at IS NULL
        `,
        [input.email, input.purpose, input.now],
      );
      await client.query(
        `
          INSERT INTO email_challenges (
            email,
            purpose,
            code_digest,
            expires_at,
            requested_ip,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          input.email,
          input.purpose,
          input.codeDigest,
          input.expiresAt,
          input.requestedIp,
          input.now,
        ],
      );
      await client.query(
        `
          INSERT INTO email_outbox (
            to_email,
            template,
            payload,
            created_at,
            next_attempt_at
          )
          VALUES ($1, $2, $3::jsonb, $4, $4)
        `,
        [
          input.email,
          input.purpose === "REGISTRATION" ? "registration-code" : "password-reset-code",
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

  private async lockLatestChallenge(
    client: PoolClient,
    email: string,
    purpose: EmailChallengePurpose,
  ): Promise<{
    id: string;
    code_digest: Buffer;
    expires_at: Date;
    attempts: number;
    max_attempts: number;
  } | null> {
    const result = await client.query<{
      id: string;
      code_digest: Buffer;
      expires_at: Date;
      attempts: number;
      max_attempts: number;
    }>(
      `
        SELECT id, code_digest, expires_at, attempts, max_attempts
        FROM email_challenges
        WHERE email = $1
          AND purpose = $2
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [email, purpose],
    );
    return result.rows[0] ?? null;
  }

  private async verifyLockedChallenge(
    client: PoolClient,
    challenge: Awaited<ReturnType<PgAuthRepository["lockLatestChallenge"]>>,
    observedDigest: Buffer,
    now: Date,
  ): Promise<"VALID" | "INVALID" | "EXPIRED"> {
    if (!challenge) {
      return "INVALID";
    }
    if (challenge.expires_at.getTime() < now.getTime()) {
      await client.query("UPDATE email_challenges SET consumed_at = $2 WHERE id = $1", [
        challenge.id,
        now,
      ]);
      return "EXPIRED";
    }
    if (
      challenge.attempts >= challenge.max_attempts ||
      !digestsEqual(challenge.code_digest, observedDigest)
    ) {
      await client.query(
        `
          UPDATE email_challenges
          SET
            attempts = attempts + 1,
            consumed_at = CASE
              WHEN attempts + 1 >= max_attempts THEN $2
              ELSE consumed_at
            END
          WHERE id = $1
        `,
        [challenge.id, now],
      );
      return "INVALID";
    }

    await client.query("UPDATE email_challenges SET consumed_at = $2 WHERE id = $1", [
      challenge.id,
      now,
    ]);
    return "VALID";
  }

  public async registerUser(input: {
    email: string;
    observedCodeDigest: Buffer;
    passwordHash: string;
    now: Date;
  }): Promise<ChallengeConsumptionResult> {
    return withTransaction(this.pool, async (client) => {
      const challenge = await this.lockLatestChallenge(client, input.email, "REGISTRATION");
      const challengeResult = await this.verifyLockedChallenge(
        client,
        challenge,
        input.observedCodeDigest,
        input.now,
      );
      if (challengeResult !== "VALID") {
        return challengeResult;
      }

      const existingUser = await client.query("SELECT 1 FROM users WHERE email = $1", [
        input.email,
      ]);
      if (existingUser.rowCount) {
        return "USER_ALREADY_EXISTS";
      }

      await client.query(
        `
          INSERT INTO users (
            email,
            password_hash,
            email_verified_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $3, $3)
        `,
        [input.email, input.passwordHash, input.now],
      );
      return "CONSUMED";
    });
  }

  public async resetPassword(input: {
    email: string;
    observedCodeDigest: Buffer;
    passwordHash: string;
    now: Date;
  }): Promise<ChallengeConsumptionResult> {
    return withTransaction(this.pool, async (client) => {
      const challenge = await this.lockLatestChallenge(client, input.email, "PASSWORD_RESET");
      const challengeResult = await this.verifyLockedChallenge(
        client,
        challenge,
        input.observedCodeDigest,
        input.now,
      );
      if (challengeResult !== "VALID") {
        return challengeResult;
      }

      const userResult = await client.query<{ id: string }>(
        `
          UPDATE users
          SET
            password_hash = $2,
            auth_version = auth_version + 1,
            updated_at = $3
          WHERE email = $1
          RETURNING id
        `,
        [input.email, input.passwordHash, input.now],
      );
      const user = userResult.rows[0];
      if (!user) {
        return "USER_NOT_FOUND";
      }

      await client.query(
        `
          UPDATE sessions
          SET revoked_at = $2, revoke_reason = 'PASSWORD_RESET'
          WHERE user_id = $1 AND revoked_at IS NULL
        `,
        [user.id, input.now],
      );
      return "CONSUMED";
    });
  }

  public async userExists(email: string): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    return Boolean(result.rowCount);
  }

  public async findUserByEmail(email: string): Promise<LoginUserRecord | null> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      password_hash: string;
      auth_version: number;
      disabled_at: Date | null;
      duration_days: number | null;
      starts_at: Date | null;
      ends_at: Date | null;
    }>(
      `
        SELECT
          users.id,
          users.email,
          users.password_hash,
          users.auth_version,
          users.disabled_at,
          entitlements.duration_days,
          entitlements.starts_at,
          entitlements.ends_at
        FROM users
        LEFT JOIN entitlements ON entitlements.user_id = users.id
        WHERE users.email = $1
      `,
      [email],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      authVersion: row.auth_version,
      disabledAt: row.disabled_at,
      entitlement: toEntitlement(row),
    };
  }

  public async redeemInvite(input: {
    userId: string;
    codeDigest: Buffer;
    now: Date;
  }): Promise<InviteRedemptionResult> {
    return withTransaction(this.pool, async (client) => {
      const userResult = await client.query(
        `
          SELECT id
          FROM users
          WHERE id = $1 AND disabled_at IS NULL
          FOR UPDATE
        `,
        [input.userId],
      );
      if (!userResult.rowCount) {
        return { kind: "INVALID" };
      }

      const codeResult = await client.query<{
        id: string;
        status: "ACTIVE" | "REDEEMED" | "REVOKED";
        duration_days: EntitlementDurationDays;
        claim_expires_at: Date;
      }>(
        `
          SELECT id, status, duration_days, claim_expires_at
          FROM invite_codes
          WHERE code_digest = $1
          FOR UPDATE
        `,
        [input.codeDigest],
      );
      const code = codeResult.rows[0];
      if (!code || code.status === "REVOKED") {
        return { kind: "INVALID" };
      }
      if (code.status === "REDEEMED") {
        return { kind: "ALREADY_REDEEMED" };
      }
      if (code.claim_expires_at.getTime() < input.now.getTime()) {
        return { kind: "EXPIRED" };
      }

      const entitlementResult = await client.query<{
        duration_days: number;
        starts_at: Date;
        ends_at: Date;
      }>(
        `
          SELECT duration_days, starts_at, ends_at
          FROM entitlements
          WHERE user_id = $1
          FOR UPDATE
        `,
        [input.userId],
      );
      const currentEntitlement = entitlementResult.rows[0];
      const period = calculateEntitlementPeriod({
        now: input.now,
        currentEndsAt: currentEntitlement?.ends_at ?? null,
        durationDays: code.duration_days,
      });
      const entitlement: EntitlementRecord = {
        durationDays: code.duration_days,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      };

      await client.query(
        `
          INSERT INTO entitlements (
            user_id,
            duration_days,
            starts_at,
            ends_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id) DO UPDATE
          SET
            duration_days = EXCLUDED.duration_days,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          input.userId,
          entitlement.durationDays,
          entitlement.startsAt,
          entitlement.endsAt,
          input.now,
        ],
      );
      await client.query(
        `
          UPDATE invite_codes
          SET status = 'REDEEMED', redeemed_at = $2
          WHERE id = $1 AND status = 'ACTIVE'
        `,
        [code.id, input.now],
      );
      await client.query(
        `
          INSERT INTO invite_redemptions (
            invite_code_id,
            user_id,
            previous_entitlement_ends_at,
            entitlement_ends_at,
            redeemed_at
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [code.id, input.userId, currentEntitlement?.ends_at ?? null, entitlement.endsAt, input.now],
      );

      return { kind: "REDEEMED", entitlement };
    });
  }

  public async issueSession(input: IssueSessionInput): Promise<IssuedSessionRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const userResult = await client.query(
        `
          SELECT id
          FROM users
          WHERE id = $1 AND disabled_at IS NULL
          FOR UPDATE
        `,
        [input.userId],
      );
      if (!userResult.rowCount) {
        return null;
      }
      await client.query(
        `
          UPDATE sessions
          SET revoked_at = $2, revoke_reason = 'SESSION_EXPIRED'
          WHERE user_id = $1
            AND revoked_at IS NULL
            AND refresh_expires_at < $2
        `,
        [input.userId, input.now],
      );
      await client.query(
        `
          UPDATE sessions
          SET revoked_at = $3, revoke_reason = 'REPLACED_ON_DEVICE'
          WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL
        `,
        [input.userId, input.deviceId, input.now],
      );

      const activeSessions = await client.query<{ id: string }>(
        `
          SELECT id
          FROM sessions
          WHERE user_id = $1 AND revoked_at IS NULL
          ORDER BY created_at ASC
          FOR UPDATE
        `,
        [input.userId],
      );
      const excessSessionIds = activeSessions.rows
        .slice(0, Math.max(0, activeSessions.rows.length - 1))
        .map((session) => session.id);
      if (excessSessionIds.length > 0) {
        await client.query(
          `
            UPDATE sessions
            SET revoked_at = $2, revoke_reason = 'DEVICE_LIMIT'
            WHERE id = ANY($1::uuid[])
          `,
          [excessSessionIds, input.now],
        );
      }

      const sessionResult = await client.query<{ id: string }>(
        `
          INSERT INTO sessions (
            user_id,
            device_id,
            device_label,
            access_token_digest,
            refresh_token_digest,
            access_expires_at,
            refresh_expires_at,
            last_seen_at,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          RETURNING id
        `,
        [
          input.userId,
          input.deviceId,
          input.deviceLabel,
          input.accessTokenDigest,
          input.refreshTokenDigest,
          input.accessExpiresAt,
          input.refreshExpiresAt,
          input.now,
        ],
      );

      const countResult = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM sessions
          WHERE user_id = $1 AND revoked_at IS NULL
        `,
        [input.userId],
      );
      return {
        sessionId: sessionResult.rows[0]!.id,
        activeDeviceCount: countResult.rows[0]?.count ?? 1,
      };
    });
  }

  public async findSessionByAccessDigest(
    accessTokenDigest: Buffer,
    now: Date,
  ): Promise<SessionIdentityRecord | null> {
    const result = await this.pool.query<{
      session_id: string;
      user_id: string;
      email: string;
      device_id: string;
      disabled_at: Date | null;
      duration_days: number | null;
      starts_at: Date | null;
      ends_at: Date | null;
    }>(
      `
        UPDATE sessions
        SET last_seen_at = $2
        FROM users
        LEFT JOIN entitlements ON entitlements.user_id = users.id
        WHERE sessions.access_token_digest = $1
          AND sessions.user_id = users.id
          AND sessions.revoked_at IS NULL
          AND sessions.access_expires_at >= $2
        RETURNING
          sessions.id AS session_id,
          users.id AS user_id,
          users.email,
          sessions.device_id,
          users.disabled_at,
          entitlements.duration_days,
          entitlements.starts_at,
          entitlements.ends_at
      `,
      [accessTokenDigest, now],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      deviceId: row.device_id,
      disabledAt: row.disabled_at,
      entitlement: toEntitlement(row),
    };
  }

  public async rotateSession(input: RotateSessionInput): Promise<SessionIdentityRecord | null> {
    return withTransaction(this.pool, async (client) => {
      const sessionResult = await client.query<{
        session_id: string;
        user_id: string;
        email: string;
        device_id: string;
        disabled_at: Date | null;
        duration_days: number | null;
        starts_at: Date | null;
        ends_at: Date | null;
      }>(
        `
          SELECT
            sessions.id AS session_id,
            users.id AS user_id,
            users.email,
            sessions.device_id,
            users.disabled_at,
            entitlements.duration_days,
            entitlements.starts_at,
            entitlements.ends_at
          FROM sessions
          JOIN users ON users.id = sessions.user_id
          LEFT JOIN entitlements ON entitlements.user_id = users.id
          WHERE sessions.refresh_token_digest = $1
            AND sessions.device_id = $2
            AND sessions.revoked_at IS NULL
            AND sessions.refresh_expires_at >= $3
          FOR UPDATE OF sessions
        `,
        [input.refreshTokenDigest, input.deviceId, input.now],
      );
      const row = sessionResult.rows[0];
      if (!row) {
        return null;
      }

      await client.query(
        `
          UPDATE sessions
          SET
            access_token_digest = $2,
            refresh_token_digest = $3,
            access_expires_at = $4,
            refresh_expires_at = $5,
            last_seen_at = $6
          WHERE id = $1
        `,
        [
          row.session_id,
          input.nextAccessTokenDigest,
          input.nextRefreshTokenDigest,
          input.accessExpiresAt,
          input.refreshExpiresAt,
          input.now,
        ],
      );

      return {
        sessionId: row.session_id,
        userId: row.user_id,
        email: row.email,
        deviceId: row.device_id,
        disabledAt: row.disabled_at,
        entitlement: toEntitlement(row),
      };
    });
  }

  public async countActiveDevices(userId: string, now: Date): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      `
        SELECT count(*)::int AS count
        FROM sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND refresh_expires_at >= $2
      `,
      [userId, now],
    );
    return result.rows[0]?.count ?? 0;
  }

  public async revokeSession(sessionId: string, reason: string, now: Date): Promise<void> {
    await this.pool.query(
      `
        UPDATE sessions
        SET revoked_at = $2, revoke_reason = $3
        WHERE id = $1 AND revoked_at IS NULL
      `,
      [sessionId, now, reason],
    );
  }

  public async recordAuditEvent(input: AuditEventInput): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO auth_audit_events (
          user_id,
          email,
          event_type,
          source_ip,
          device_id,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        input.userId ?? null,
        input.email ?? null,
        input.eventType,
        input.sourceIp ?? null,
        input.deviceId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.now,
      ],
    );
  }
}
