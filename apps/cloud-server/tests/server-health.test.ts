import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import type { Pool } from "pg";

import type { CloudAuthConfig } from "../src/config.ts";
import { buildAuthServer } from "../src/server.ts";

function createConfig(): CloudAuthConfig {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    host: "127.0.0.1",
    port: 8787,
    databaseUrl: "postgresql://unused",
    inviteCodePepper: "invite-code-pepper-at-least-32-bytes",
    tokenPepper: "token-pepper-at-least-32-random-bytes",
    emailCodePepper: "email-code-pepper-at-least-32-bytes",
    loginChallengeSecret: "login-challenge-secret-at-least-32-bytes",
    offlineLeasePrivateKeyPem: privateKey.export({
      format: "pem",
      type: "pkcs8",
    }) as string,
    offlineLeasePublicKeyPem: publicKey.export({
      format: "pem",
      type: "spki",
    }) as string,
    inviteExportDirectory: "/tmp/invite-exports",
    smtp: null,
  };
}

function createPool(query: (sql?: string, values?: unknown[]) => Promise<unknown>): Pool {
  return {
    query,
  } as unknown as Pool;
}

test("liveness does not depend on PostgreSQL", async () => {
  let queryCount = 0;
  const server = await buildAuthServer(
    createConfig(),
    createPool(async () => {
      queryCount += 1;
      throw new Error("database unavailable");
    }),
  );

  try {
    const response = await server.inject({
      method: "GET",
      url: "/health/live",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: "ok" });
    assert.equal(queryCount, 0);
  } finally {
    await server.close();
  }
});

test("readiness and the legacy health endpoint both verify PostgreSQL", async () => {
  let queryCount = 0;
  const queries: Array<{ sql?: string; values?: unknown[] }> = [];
  const server = await buildAuthServer(
    createConfig(),
    createPool(async (sql, values) => {
      queryCount += 1;
      queries.push({ sql, values });
      return { rows: [{ migrated: true }] };
    }),
  );

  try {
    const readiness = await server.inject({
      method: "GET",
      url: "/health/ready",
    });
    const legacy = await server.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(readiness.statusCode, 200);
    assert.deepEqual(readiness.json(), { status: "ok" });
    assert.equal(legacy.statusCode, 200);
    assert.deepEqual(legacy.json(), { status: "ok" });
    assert.equal(queryCount, 2);
    assert.match(queries[0]?.sql ?? "", /schema_migrations/u);
    assert.deepEqual(queries[0]?.values, [3]);
  } finally {
    await server.close();
  }
});

test("readiness rejects a database whose auth migration is incomplete", async () => {
  const server = await buildAuthServer(
    createConfig(),
    createPool(async () => ({ rows: [{ migrated: false }] })),
  );

  try {
    const response = await server.inject({
      method: "GET",
      url: "/health/ready",
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: "unavailable" });
  } finally {
    await server.close();
  }
});

test("readiness failure returns no database details", async () => {
  const server = await buildAuthServer(
    createConfig(),
    createPool(async () => {
      throw new Error("password=must-not-leak");
    }),
  );

  try {
    const response = await server.inject({
      method: "GET",
      url: "/health/ready",
    });

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: "unavailable" });
    assert.equal(response.body.includes("must-not-leak"), false);
  } finally {
    await server.close();
  }
});

test("malformed JSON is rejected as a client error instead of service downtime", async () => {
  const server = await buildAuthServer(
    createConfig(),
    createPool(async () => ({ rows: [] })),
  );

  try {
    const response = await server.inject({
      method: "POST",
      url: "/v1/auth/sessions",
      headers: {
        "content-type": "application/json",
      },
      payload: '{"email":"learner@example.com"',
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: {
        code: "ACCESS_DENIED",
        message: "Request body is invalid",
      },
    });
  } finally {
    await server.close();
  }
});
