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

const unusedPool = {
  query: async () => ({ rows: [] }),
} as unknown as Pool;

test("administrator routes require the exact same-origin request", async () => {
  let requestCount = 0;
  const server = await buildAuthServer(createConfig(), unusedPool, {
    adminService: {
      requestLoginCode: async () => {
        requestCount += 1;
        return { accepted: true as const, retryAfterSeconds: 60 as const };
      },
      login: async () => {
        throw new Error("not used");
      },
      getSession: async () => {
        throw new Error("not used");
      },
      logout: async () => {
        throw new Error("not used");
      },
    },
  });

  try {
    const missingOrigin = await server.inject({
      method: "POST",
      url: "/v1/admin/login-code-requests",
      payload: { email: "admin@example.com" },
    });
    assert.equal(missingOrigin.statusCode, 403);

    const accepted = await server.inject({
      method: "POST",
      url: "/v1/admin/login-code-requests",
      headers: { origin: "https://fnndp.xyz" },
      payload: { email: "admin@example.com" },
    });
    assert.equal(accepted.statusCode, 200);
    assert.deepEqual(accepted.json(), {
      data: { accepted: true, retryAfterSeconds: 60 },
    });
    assert.equal(requestCount, 1);
  } finally {
    await server.close();
  }
});

test("administrator sessions use a secure browser-session cookie", async () => {
  let observedSessionToken = "";
  const server = await buildAuthServer(createConfig(), unusedPool, {
    adminService: {
      requestLoginCode: async () => ({
        accepted: true as const,
        retryAfterSeconds: 60 as const,
      }),
      login: async () => ({
        admin: { email: "admin@example.com" },
        sessionToken: "qad_test-session-token-value-that-is-long-enough",
      }),
      getSession: async (sessionToken: string) => {
        observedSessionToken = sessionToken;
        return { email: "admin@example.com" };
      },
      logout: async (sessionToken: string) => {
        observedSessionToken = sessionToken;
        return { signedOut: true as const };
      },
    },
  });

  try {
    const login = await server.inject({
      method: "POST",
      url: "/v1/admin/sessions",
      headers: { origin: "https://fnndp.xyz" },
      payload: { email: "admin@example.com", emailCode: "123456" },
    });
    assert.equal(login.statusCode, 200);
    assert.deepEqual(login.json(), {
      data: { admin: { email: "admin@example.com" } },
    });
    const cookie = login.headers["set-cookie"];
    assert.match(String(cookie), /__Host-quant_admin=/u);
    assert.match(String(cookie), /HttpOnly/u);
    assert.match(String(cookie), /Secure/u);
    assert.match(String(cookie), /SameSite=Strict/u);
    assert.match(String(cookie), /Path=\//u);
    assert.doesNotMatch(String(cookie), /Max-Age|Expires/u);

    const cookieHeader = String(cookie).split(";")[0]!;
    const current = await server.inject({
      method: "GET",
      url: "/v1/admin/session",
      headers: { cookie: cookieHeader },
    });
    assert.equal(current.statusCode, 200);
    assert.equal(
      observedSessionToken,
      "qad_test-session-token-value-that-is-long-enough",
    );

    const logout = await server.inject({
      method: "DELETE",
      url: "/v1/admin/session",
      headers: {
        cookie: cookieHeader,
        origin: "https://fnndp.xyz",
      },
    });
    assert.equal(logout.statusCode, 200);
    assert.match(String(logout.headers["set-cookie"]), /Max-Age=0/u);
  } finally {
    await server.close();
  }
});
