import assert from "node:assert/strict";
import test from "node:test";

import { CloudAuthClientError, createCloudAuthClient } from "../src/auth.ts";

test("cloud auth login uses the typed endpoint and device headers", async () => {
  let observedUrl = "";
  let observedHeaders = new Headers();
  const client = createCloudAuthClient({
    baseUrl: "https://auth.example.com/",
    fetcher: async (input, init) => {
      observedUrl = String(input);
      observedHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          data: {
            kind: "INVITE_REQUIRED",
            loginChallenge: "signed-main-process-only-challenge",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await client.login(
    { email: "learner@example.com", password: "Quant#2026" },
    { deviceId: "device-1234", deviceLabel: "Windows desktop" },
  );

  assert.equal(observedUrl, "https://auth.example.com/v1/auth/sessions");
  assert.equal(observedHeaders.get("x-device-id"), "device-1234");
  assert.equal(observedHeaders.get("x-device-label"), "Windows desktop");
  assert.equal(result.kind, "INVITE_REQUIRED");
});

test("cloud auth errors expose only renderer-safe error codes", async () => {
  const client = createCloudAuthClient({
    baseUrl: "https://auth.example.com",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "INVITE_EXPIRED",
            message: "Invite code has expired",
            internalSql: "SELECT * FROM secrets",
          },
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  await assert.rejects(
    () =>
      client.redeemInvite(
        {
          loginChallenge: "challenge",
          inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
        },
        { deviceId: "device-1234", deviceLabel: "Windows desktop" },
      ),
    (error: unknown) => {
      assert.equal(error instanceof CloudAuthClientError, true);
      assert.equal((error as CloudAuthClientError).code, "INVITE_EXPIRED");
      assert.equal(JSON.stringify(error).includes("internalSql"), false);
      return true;
    },
  );
});

test("transport failures and server failures map to stable codes", async () => {
  const offlineClient = createCloudAuthClient({
    baseUrl: "https://auth.example.com",
    fetcher: async () => {
      throw new TypeError("socket details must stay private");
    },
  });
  await assert.rejects(
    () => offlineClient.getSession("qat_token"),
    (error: unknown) =>
      error instanceof CloudAuthClientError && error.code === "NETWORK_UNAVAILABLE",
  );

  const unavailableClient = createCloudAuthClient({
    baseUrl: "https://auth.example.com",
    fetcher: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(
    () => unavailableClient.getSession("qat_token"),
    (error: unknown) =>
      error instanceof CloudAuthClientError && error.code === "SERVICE_UNAVAILABLE",
  );
});

test("successful responses are rejected when their authentication shape is malformed", async () => {
  const client = createCloudAuthClient({
    baseUrl: "https://auth.example.com",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          data: {
            kind: "AUTHENTICATED",
            bundle: {
              accessToken: "attacker-controlled",
              refreshToken: "attacker-controlled",
              offlineLease: "not-a-signed-lease",
              session: { userId: "user-1" },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  await assert.rejects(
    () =>
      client.login(
        { email: "learner@example.com", password: "Quant#2026" },
        { deviceId: "device-1234", deviceLabel: "Windows desktop" },
      ),
    (error: unknown) =>
      error instanceof CloudAuthClientError && error.code === "SERVICE_UNAVAILABLE",
  );
});

test("remote auth endpoints require HTTPS while loopback HTTP remains available for development", () => {
  assert.throws(() => createCloudAuthClient({ baseUrl: "http://auth.example.com" }), /HTTPS/i);
  assert.doesNotThrow(() => createCloudAuthClient({ baseUrl: "http://127.0.0.1:8787" }));
});
