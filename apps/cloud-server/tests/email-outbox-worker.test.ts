import assert from "node:assert/strict";
import test from "node:test";

import type { Transporter } from "nodemailer";
import type { Pool } from "pg";

import { EmailOutboxWorker, createEmailOutboxWorker } from "../src/services/emailOutboxWorker.ts";

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

function createMessagePool(message: {
  template: string;
  payload: { code: string; expiresInMinutes: number };
  attemptCount: number;
}) {
  let claimed = false;
  const transactionQueries: string[] = [];
  const completionQueries: Array<{ sql: string; values: unknown[] }> = [];
  const client = {
    async query(sql: string) {
      transactionQueries.push(sql);
      if (sql.includes("UPDATE email_outbox AS outbox") && !claimed) {
        claimed = true;
        return {
          rows: [
            {
              id: "d0f3d999-dfd5-429b-97ee-93561eed73b3",
              to_email: "learner@example.test",
              template: message.template,
              payload: message.payload,
              attempt_count: message.attemptCount,
              claim_token: "f23c9673-a666-44c4-bf61-6b867df951bf",
            },
          ],
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
  return { pool, completionQueries, transactionQueries };
}

test("password reset messages render and deliver through the alternate template", async () => {
  const { pool } = createMessagePool({
    template: "password-reset-code",
    payload: { code: "654321", expiresInMinutes: 10 },
    attemptCount: 1,
  });
  const deliveries: Array<Record<string, unknown>> = [];
  const transporter = {
    async sendMail(message: Record<string, unknown>) {
      deliveries.push(message);
      return {};
    },
  } as unknown as Transporter;

  await new EmailOutboxWorker(pool, transporter, "no-reply@example.test").drainOnce();

  assert.equal(deliveries.length, 1);
  assert.match(String(deliveries[0]?.text), /654321/u);
  assert.match(String(deliveries[0]?.html), /654321/u);
});

test("invalid payloads fail safely without reaching SMTP", async () => {
  const { pool, completionQueries } = createMessagePool({
    template: "registration-code",
    payload: { code: "not-a-code", expiresInMinutes: 5 },
    attemptCount: 2,
  });
  let sendCalls = 0;
  const transporter = {
    async sendMail() {
      sendCalls += 1;
      return {};
    },
  } as unknown as Transporter;

  await new EmailOutboxWorker(pool, transporter, "no-reply@example.test").drainOnce();

  assert.equal(sendCalls, 0);
  assert.match(completionQueries[0]!.sql, /status = 'FAILED'/u);
  assert.deepEqual(completionQueries[0]!.values, [
    "d0f3d999-dfd5-429b-97ee-93561eed73b3",
    "DELIVERY_FAILED:UNKNOWN",
    4,
    false,
    "f23c9673-a666-44c4-bf61-6b867df951bf",
  ]);
});

test("SMTP failures keep safe diagnostics and clear terminal payloads", async () => {
  const { pool, completionQueries } = createMessagePool({
    template: "registration-code",
    payload: { code: "123456", expiresInMinutes: 10 },
    attemptCount: 8,
  });
  const transporter = {
    async sendMail() {
      throw {
        code: "ECONNECTION",
        responseCode: 421,
        response: "must never be persisted",
      };
    },
  } as unknown as Transporter;

  await new EmailOutboxWorker(pool, transporter, "no-reply@example.test").drainOnce();

  assert.deepEqual(completionQueries[0]!.values, [
    "d0f3d999-dfd5-429b-97ee-93561eed73b3",
    "DELIVERY_FAILED:ECONNECTION:421",
    60,
    true,
    "f23c9673-a666-44c4-bf61-6b867df951bf",
  ]);
});

test("claim failures roll back and always release the PostgreSQL client", async () => {
  const queries: string[] = [];
  let released = false;
  const pool = {
    async connect() {
      return {
        async query(sql: string) {
          queries.push(sql);
          if (sql.includes("UPDATE email_outbox AS outbox")) {
            throw new Error("claim failed");
          }
          return { rows: [] };
        },
        release() {
          released = true;
        },
      };
    },
  } as unknown as Pool;
  const transporter = {
    async sendMail() {
      return {};
    },
  } as unknown as Transporter;

  await assert.rejects(
    new EmailOutboxWorker(pool, transporter, "no-reply@example.test").drainOnce(),
    /claim failed/u,
  );
  assert.equal(queries.includes("ROLLBACK"), true);
  assert.equal(released, true);
});

test("worker start and stop are idempotent and concurrent drains stay single-flight", async () => {
  let releaseConnect: (() => void) | undefined;
  const connectGate = new Promise<void>((resolve) => {
    releaseConnect = resolve;
  });
  let connectCalls = 0;
  const pool = {
    async connect() {
      connectCalls += 1;
      await connectGate;
      return {
        async query() {
          return { rows: [] };
        },
        release() {},
      };
    },
  } as unknown as Pool;
  const transporter = {
    async sendMail() {
      return {};
    },
  } as unknown as Transporter;
  const worker = new EmailOutboxWorker(pool, transporter, "no-reply@example.test");

  worker.start();
  worker.start();
  const concurrentDrain = worker.drainOnce();
  releaseConnect?.();
  await concurrentDrain;
  await new Promise<void>((resolve) => setImmediate(resolve));
  worker.stop();
  worker.stop();

  assert.equal(connectCalls, 1);
});

test("SMTP configuration creates a worker without opening a connection eagerly", () => {
  const pool = {} as Pool;
  const worker = createEmailOutboxWorker(pool, {
    host: "smtp.example.test",
    port: 465,
    secure: true,
    user: "mailer",
    password: "secret",
    from: "no-reply@example.test",
  });

  assert.equal(worker instanceof EmailOutboxWorker, true);
  worker.stop();
});
