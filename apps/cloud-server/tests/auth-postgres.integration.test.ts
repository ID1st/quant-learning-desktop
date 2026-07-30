import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Pool } from "pg";

import { PgAuthRepository } from "../src/repositories/pgAuthRepository.ts";
import {
  runPostgresMigrations,
  type PostgresMigrationClient,
} from "../src/db/migrationRunner.ts";
import {
  digestInviteCode,
  normalizeInviteCode,
} from "../src/security/inviteCodes.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

async function applyAuthMigrations(pool: Pool) {
  const client = await pool.connect();
  try {
    const migrationClient: PostgresMigrationClient = {
      async query(sql, values) {
        const result = await client.query(sql, values);
        return { rows: result.rows };
      },
    };
    await runPostgresMigrations({
      client: migrationClient,
      directory: fileURLToPath(new URL("../migrations", import.meta.url)),
    });
  } finally {
    client.release();
  }
}

test(
  "PostgreSQL row locking permits only one concurrent redemption",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await applyAuthMigrations(pool);

    const userId = randomUUID();
    const batchId = randomUUID();
    const codeId = randomUUID();
    const plaintextCode = "QLD-ABCDE-FGHJK-MNPQR";
    const pepper = "integration-test-pepper-at-least-32-bytes";
    const codeDigest = digestInviteCode(
      normalizeInviteCode(plaintextCode),
      pepper,
    );
    const now = new Date("2026-07-28T00:00:00.000Z");

    try {
      await pool.query(
        `
          INSERT INTO users (
            id,
            email,
            password_hash,
            email_verified_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, 'test-only', $3, $3, $3)
        `,
        [userId, `${userId}@example.test`, now],
      );
      await pool.query(
        `
          INSERT INTO invite_batches (
            id,
            claim_expires_at,
            total_count,
            created_by,
            created_at
          )
          VALUES ($1, $2, 1, 'integration-test', $3)
        `,
        [batchId, new Date("2026-08-28T00:00:00.000Z"), now],
      );
      await pool.query(
        `
          INSERT INTO invite_codes (
            id,
            batch_id,
            code_digest,
            duration_days,
            claim_expires_at,
            created_at
          )
          VALUES ($1, $2, $3, 30, $4, $5)
        `,
        [
          codeId,
          batchId,
          codeDigest,
          new Date("2026-08-28T00:00:00.000Z"),
          now,
        ],
      );

      const repository = new PgAuthRepository(pool);
      const results = await Promise.all([
        repository.redeemInvite({ userId, codeDigest, now }),
        repository.redeemInvite({ userId, codeDigest, now }),
      ]);

      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["ALREADY_REDEEMED", "REDEEMED"],
      );
    } finally {
      await pool.query(
        "DELETE FROM invite_redemptions WHERE invite_code_id = $1",
        [codeId],
      );
      await pool.query("DELETE FROM invite_codes WHERE id = $1", [codeId]);
      await pool.query("DELETE FROM invite_batches WHERE id = $1", [batchId]);
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      await pool.end();
    }
  },
);

test(
  "issuing a third device session revokes the oldest active device",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await applyAuthMigrations(pool);
    const userId = randomUUID();
    const baseTime = new Date("2026-07-28T00:00:00.000Z");

    try {
      await pool.query(
        `
          INSERT INTO users (
            id,
            email,
            password_hash,
            email_verified_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, 'test-only', $3, $3, $3)
        `,
        [userId, `${userId}@example.test`, baseTime],
      );
      const repository = new PgAuthRepository(pool);
      for (let index = 1; index <= 3; index += 1) {
        const issuedAt = new Date(baseTime.getTime() + index * 1_000);
        await repository.issueSession({
          userId,
          deviceId: `device-000${index}`,
          deviceLabel: `Test device ${index}`,
          accessTokenDigest: randomBytes(32),
          refreshTokenDigest: randomBytes(32),
          accessExpiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1_000),
          refreshExpiresAt: new Date(
            issuedAt.getTime() + 30 * 24 * 60 * 60 * 1_000,
          ),
          now: issuedAt,
        });
      }

      const sessions = await pool.query<{
        device_id: string;
        revoked_at: Date | null;
        revoke_reason: string | null;
      }>(
        `
          SELECT device_id, revoked_at, revoke_reason
          FROM sessions
          WHERE user_id = $1
          ORDER BY created_at
        `,
        [userId],
      );

      assert.deepEqual(
        sessions.rows.map((row) => ({
          deviceId: row.device_id,
          revoked: Boolean(row.revoked_at),
          reason: row.revoke_reason,
        })),
        [
          {
            deviceId: "device-0001",
            revoked: true,
            reason: "DEVICE_LIMIT",
          },
          {
            deviceId: "device-0002",
            revoked: false,
            reason: null,
          },
          {
            deviceId: "device-0003",
            revoked: false,
            reason: null,
          },
        ],
      );
    } finally {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
      await pool.end();
    }
  },
);

test(
  "creating an email challenge accepts a JavaScript Date and enforces the resend window",
  { skip: !databaseUrl },
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await applyAuthMigrations(pool);
    const email = `${randomUUID()}@example.test`;
    const now = new Date("2026-07-30T03:00:00.000Z");

    try {
      const repository = new PgAuthRepository(pool);
      const input = {
        email,
        purpose: "REGISTRATION" as const,
        codeDigest: randomBytes(32),
        plaintextCode: "123456",
        expiresAt: new Date(now.getTime() + 10 * 60 * 1_000),
        requestedIp: "127.0.0.1",
        now,
      };

      assert.equal(await repository.createEmailChallenge(input), true);
      assert.equal(
        await repository.createEmailChallenge({
          ...input,
          codeDigest: randomBytes(32),
        }),
        false,
      );

      const outbox = await pool.query<{ status: string }>(
        "SELECT status FROM email_outbox WHERE to_email = $1",
        [email],
      );
      assert.deepEqual(outbox.rows, [{ status: "PENDING" }]);
    } finally {
      await pool.query("DELETE FROM email_outbox WHERE to_email = $1", [email]);
      await pool.query("DELETE FROM email_challenges WHERE email = $1", [email]);
      await pool.end();
    }
  },
);
