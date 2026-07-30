import assert from "node:assert/strict";
import test from "node:test";

import type { Transporter } from "nodemailer";
import type { Pool } from "pg";

import { EmailOutboxWorker } from "../src/services/emailOutboxWorker.ts";

function createClaimingPool() {
  let claimCount = 0;
  const completionQueries: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string) {
      if (sql.includes("UPDATE email_outbox AS outbox")) {
        claimCount += 1;
        return {
          rows:
            claimCount === 1
              ? [
                  {
                    id: "8c667a28-2657-4fa3-9922-cd8cf5a2ab89",
                    to_email: "learner@example.test",
                    template: "registration-code",
                    payload: { code: "123456", expiresInMinutes: 10 },
                    attempt_count: 2,
                    claim_token: "99598aae-b438-46b2-9c89-636ca25c090a",
                  },
                ]
              : [],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
    async query(sql: string, values: unknown[]) {
      completionQueries.push({ sql, values });
      return { rows: [], rowCount: 1 };
    },
  } as unknown as Pool;
  return { pool, completionQueries };
}

test("outbox worker uses leases, claim-token completion and stable Message-ID", async () => {
  const { pool, completionQueries } = createClaimingPool();
  const deliveries: Array<Record<string, unknown>> = [];
  const transporter = {
    async sendMail(message: Record<string, unknown>) {
      deliveries.push(message);
      return {};
    },
  } as unknown as Transporter;
  const worker = new EmailOutboxWorker(pool, transporter, "no-reply@example.test");

  await worker.drainOnce();

  assert.equal(
    deliveries[0]?.messageId,
    "<outbox-8c667a28-2657-4fa3-9922-cd8cf5a2ab89@quant-learning.local>",
  );
  assert.match(completionQueries[0]!.sql, /claim_token = \$2/u);
  assert.match(completionQueries[0]!.sql, /status = 'SENDING'/u);
  assert.deepEqual(completionQueries[0]!.values, [
    "8c667a28-2657-4fa3-9922-cd8cf5a2ab89",
    "99598aae-b438-46b2-9c89-636ca25c090a",
  ]);
});

test("outbox claim query can recover an expired SENDING lease", async () => {
  const { pool } = createClaimingPool();
  const claimQueries: string[] = [];
  const originalConnect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = (async (sql: string, values?: unknown[]) => {
      if (sql.includes("UPDATE email_outbox AS outbox")) {
        claimQueries.push(sql);
      }
      return originalQuery(sql, values);
    }) as typeof client.query;
    return client;
  };
  const transporter = {
    async sendMail() {
      return {};
    },
  } as unknown as Transporter;

  await new EmailOutboxWorker(pool, transporter, "no-reply@example.test").drainOnce();

  assert.match(claimQueries[0]!, /status = 'SENDING'/u);
  assert.match(claimQueries[0]!, /lease_expires_at <= now\(\)/u);
});
