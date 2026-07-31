import assert from "node:assert/strict";
import test from "node:test";

import { AdminService, type AdminRepository } from "../src/services/adminService.ts";

const now = new Date("2026-07-31T06:00:00.000Z");
const context = { now, sourceIp: "203.0.113.8" };

function createRepository(overrides: Partial<AdminRepository> = {}): AdminRepository {
  return {
    createLoginChallenge: async () => true,
    consumeLoginChallenge: async () => ({
      kind: "AUTHENTICATED",
      admin: {
        id: "d40f05ac-3ac1-43e4-adf6-7e11ab2beb40",
        email: "admin@example.com",
      },
    }),
    findSession: async () => null,
    revokeSession: async () => undefined,
    recordAuditEvent: async () => undefined,
    ...overrides,
  };
}

function createService(repository: AdminRepository): AdminService {
  return new AdminService({
    repository,
    emailCodePepper: "email-code-pepper-at-least-32-bytes",
    tokenPepper: "token-pepper-at-least-32-random-bytes",
  });
}

test("admin login code requests return the same result and never expose the code", async () => {
  const observed: Array<{
    email: string;
    codeDigest: Buffer;
    plaintextCode: string;
    expiresAt: Date;
  }> = [];
  const service = createService(
    createRepository({
      createLoginChallenge: async (input) => {
        observed.push(input);
        return false;
      },
    }),
  );

  const result = await service.requestLoginCode(" Admin@Example.COM ", context);

  assert.deepEqual(result, { accepted: true, retryAfterSeconds: 60 });
  assert.equal("code" in result, false);
  assert.equal(observed[0]?.email, "admin@example.com");
  assert.match(observed[0]?.plaintextCode ?? "", /^\d{6}$/);
  assert.equal(observed[0]?.codeDigest.length, 32);
  assert.equal(observed[0]?.expiresAt.toISOString(), "2026-07-31T06:10:00.000Z");
});

test("admin login creates a twelve-hour single-session token without persisting plaintext", async () => {
  let persistedTokenDigest: Buffer | null = null;
  let persistedExpiry: Date | null = null;
  const service = createService(
    createRepository({
      consumeLoginChallenge: async (input) => {
        persistedTokenDigest = input.tokenDigest;
        persistedExpiry = input.sessionExpiresAt;
        return {
          kind: "AUTHENTICATED",
          admin: {
            id: "d40f05ac-3ac1-43e4-adf6-7e11ab2beb40",
            email: "admin@example.com",
          },
        };
      },
    }),
  );

  const result = await service.login({ email: "admin@example.com", emailCode: "123456" }, context);

  assert.match(result.sessionToken, /^qad_[A-Za-z0-9_-]{40,}$/);
  assert.equal(persistedTokenDigest?.includes(Buffer.from(result.sessionToken)), false);
  assert.equal(persistedExpiry?.toISOString(), "2026-07-31T18:00:00.000Z");
  assert.deepEqual(result.admin, { email: "admin@example.com" });
});

test("admin login failures remain generic and sessions can be revoked", async () => {
  const service = createService(
    createRepository({
      consumeLoginChallenge: async () => ({ kind: "INVALID" }),
    }),
  );
  await assert.rejects(
    service.login({ email: "admin@example.com", emailCode: "000000" }, context),
    /administrator login was not accepted/u,
  );

  let revokedDigest: Buffer | null = null;
  const logoutService = createService(
    createRepository({
      revokeSession: async (tokenDigest) => {
        revokedDigest = tokenDigest;
      },
    }),
  );
  await logoutService.logout("qad_valid-session-token-value-that-is-long-enough", context);
  assert.equal(revokedDigest?.length, 32);
});

test("administrator session lookup, input validation and invite audits remain fail closed", async () => {
  const auditEvents: Array<{ eventType: string; metadata?: Record<string, unknown> }> = [];
  const identity = {
    id: "d40f05ac-3ac1-43e4-adf6-7e11ab2beb40",
    email: "admin@example.com",
  };
  const service = createService(
    createRepository({
      findSession: async () => identity,
      recordAuditEvent: async (event) => {
        auditEvents.push(event);
      },
    }),
  );

  await assert.rejects(
    service.login({ email: identity.email, emailCode: "abc" }, context),
    /not accepted/u,
  );
  await assert.rejects(service.getSession("invalid", context), /session is invalid/u);
  assert.deepEqual(
    await service.getSession("qad_valid-session-token-value-that-is-long-enough", context),
    { email: identity.email },
  );
  await service.recordInviteAction(
    "ADMIN_INVITE_BATCH_CREATED",
    identity.email,
    "5047a4b6-a720-4edc-b1ba-1f7487b8d528",
    3,
    context,
  );
  assert.deepEqual(auditEvents.at(-1)?.metadata, {
    batchId: "5047a4b6-a720-4edc-b1ba-1f7487b8d528",
    totalCount: 3,
  });
});

test("missing sessions and audit storage failures do not disclose internals", async () => {
  const service = createService(
    createRepository({
      findSession: async () => null,
      recordAuditEvent: async () => {
        throw new Error("audit storage unavailable");
      },
    }),
  );

  await assert.rejects(
    service.getSession("qad_valid-session-token-value-that-is-long-enough", context),
    /session is invalid/u,
  );
  await assert.doesNotReject(service.requestLoginCode("admin@example.com", context));
});
