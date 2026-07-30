import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import type { Transporter } from "nodemailer";
import { Pool, type PoolClient } from "pg";

import {
  runPostgresMigrations,
  type PostgresMigrationClient,
} from "../src/db/migrationRunner.ts";
import { EmailOutboxWorker } from "../src/services/emailOutboxWorker.ts";

const databaseUrl = process.env.TEST_DATABASE_URL;

function migrationClient(client: PoolClient): PostgresMigrationClient {
  return {
    async query(sql, values) {
      const result = await client.query(sql, values);
      return { rows: result.rows };
    },
  };
}

test(
  "PostgreSQL outbox concurrently claims messages and recovers expired leases",
  { skip: !databaseUrl },
  async () => {
    const adminPool = new Pool({ connectionString: databaseUrl });
    const schema = `outbox_${randomUUID().replaceAll("-", "_")}`;
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const schemaUrl = new URL(databaseUrl!);
    schemaUrl.searchParams.set(
      "options",
      `-c search_path=${schema},public`,
    );
    const pool = new Pool({ connectionString: schemaUrl.toString(), max: 6 });
    try {
      const migrationConnection = await pool.connect();
      try {
        await runPostgresMigrations({
          client: migrationClient(migrationConnection),
          directory: fileURLToPath(
            new URL("../migrations", import.meta.url),
          ),
        });
      } finally {
        migrationConnection.release();
      }

      const messageIds = [randomUUID(), randomUUID(), randomUUID()];
      await pool.query(
        `INSERT INTO email_outbox (
          id, to_email, template, payload, status, attempt_count,
          next_attempt_at, claim_token, claimed_at, lease_expires_at
        )
        VALUES
          ($1, 'one@example.test', 'registration-code', $4, 'PENDING', 0, now(), NULL, NULL, NULL),
          ($2, 'two@example.test', 'password-reset-code', $4, 'PENDING', 0, now(), NULL, NULL, NULL),
          ($3, 'three@example.test', 'registration-code', $4, 'SENDING', 1, now(), gen_random_uuid(), now() - interval '2 minutes', now() - interval '1 minute')`,
        [
          ...messageIds,
          { code: "123456", expiresInMinutes: 10 },
        ],
      );
      const delivered = new Set<string>();
      const transporter = {
        async sendMail(message: { messageId?: string }) {
          assert.ok(message.messageId);
          assert.equal(delivered.has(message.messageId), false);
          delivered.add(message.messageId);
          return {};
        },
      } as unknown as Transporter;

      await Promise.all([
        new EmailOutboxWorker(
          pool,
          transporter,
          "no-reply@example.test",
        ).drainOnce(),
        new EmailOutboxWorker(
          pool,
          transporter,
          "no-reply@example.test",
        ).drainOnce(),
      ]);

      const rows = await pool.query<{
        id: string;
        status: string;
        attempt_count: number;
        claim_token: string | null;
        lease_expires_at: Date | null;
      }>(
        `SELECT id, status, attempt_count, claim_token, lease_expires_at
         FROM email_outbox
         ORDER BY id`,
      );
      assert.equal(delivered.size, 3);
      assert.equal(rows.rows.every((row) => row.status === "SENT"), true);
      assert.equal(rows.rows.every((row) => row.claim_token === null), true);
      assert.equal(
        rows.rows.every((row) => row.lease_expires_at === null),
        true,
      );
      assert.equal(
        rows.rows.find((row) => row.id === messageIds[2])?.attempt_count,
        2,
      );
    } finally {
      await pool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  },
);
