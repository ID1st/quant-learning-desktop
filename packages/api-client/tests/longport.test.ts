import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LONGPORT_DEFAULT_HTTP_URL,
  createLongPortSecretPreview,
  normalizeLongPortApiCredentials,
  verifyLongPortApiCredentials,
  type NormalizedLongPortApiCredentials,
} from "../src/index.ts";

describe("normalizeLongPortApiCredentials", () => {
  it("normalizes the official default HTTP endpoint and trims credential fields", () => {
    const credentials = normalizeLongPortApiCredentials({
      apiUrl: `${LONGPORT_DEFAULT_HTTP_URL}/`,
      appKey: "  app-key-123  ",
      appSecret: "  app-secret-123  ",
      accessToken: "  access-token-123  ",
    });

    assert.equal(credentials.apiUrl, LONGPORT_DEFAULT_HTTP_URL);
    assert.equal(credentials.appKey, "app-key-123");
    assert.equal(credentials.appSecret, "app-secret-123");
    assert.equal(credentials.accessToken, "access-token-123");
  });

  it("rejects non-http endpoints and short credentials", () => {
    assert.throws(
      () =>
        normalizeLongPortApiCredentials({
          apiUrl: "file:///tmp/secret",
          appKey: "app-key-123",
          appSecret: "app-secret-123",
          accessToken: "access-token-123",
        }),
      /http 或 https/,
    );

    assert.throws(
      () =>
        normalizeLongPortApiCredentials({
          apiUrl: LONGPORT_DEFAULT_HTTP_URL,
          appKey: "short",
          appSecret: "app-secret-123",
          accessToken: "access-token-123",
        }),
      /App Key 至少需要 8 位/,
    );
  });

  it("rejects remote plaintext HTTP but permits loopback development endpoints", () => {
    assert.throws(
      () =>
        normalizeLongPortApiCredentials({
          apiUrl: "http://api.example.com",
          appKey: "app-key-123",
          appSecret: "app-secret-123",
          accessToken: "access-token-123",
        }),
      /远程地址必须使用 https/,
    );

    const credentials = normalizeLongPortApiCredentials({
      apiUrl: "http://localhost:8788/",
      appKey: "app-key-123",
      appSecret: "app-secret-123",
      accessToken: "access-token-123",
    });
    assert.equal(credentials.apiUrl, "http://localhost:8788");
  });

  it("rejects HTTPS endpoints outside the LongBridge allowlist", () => {
    assert.throws(
      () => normalizeLongPortApiCredentials({ apiUrl: "https://example.invalid", appKey: "app-key-123", appSecret: "secret-123", accessToken: "token-123" }),
      /官方服务地址或本机开发地址/u,
    );
  });
});

describe("verifyLongPortApiCredentials", () => {
  it("calls the injected verification probe and returns a redacted binding summary", async () => {
    let observedCredentials: NormalizedLongPortApiCredentials | null = null;

    const summary = await verifyLongPortApiCredentials(
      {
        apiUrl: LONGPORT_DEFAULT_HTTP_URL,
        appKey: "app-key-1234",
        appSecret: "app-secret-1234",
        accessToken: "access-token-1234",
      },
      {
        now: () => new Date("2026-06-30T00:00:00.000Z"),
        probe: async (credentials) => {
          observedCredentials = credentials;
          return { markets: ["US", "HK"], accountId: "member-42" };
        },
      },
    );

    assert.equal(observedCredentials?.appSecret, "app-secret-1234");
    assert.equal(summary.apiUrl, LONGPORT_DEFAULT_HTTP_URL);
    assert.equal(summary.appKeyPreview, "app-****1234");
    assert.equal(summary.accessTokenPreview, "acce****1234");
    assert.deepEqual(summary.markets, ["US", "HK"]);
    assert.equal(summary.accountId, "member-42");
    assert.equal(summary.verifiedAt, "2026-06-30T00:00:00.000Z");
    assert.equal(summary.authMode, "legacy-api-key");
    assert.equal(JSON.stringify(summary).includes("app-secret-1234"), false);
    assert.equal(JSON.stringify(summary).includes("access-token-1234"), false);
  });
});
