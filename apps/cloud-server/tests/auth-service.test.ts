import assert from "node:assert/strict";
import test from "node:test";

import { AuthDomainError } from "../src/domain/authErrors.ts";
import type {
  ChallengeConsumptionResult,
  LoginUserRecord,
} from "../src/repositories/pgAuthRepository.ts";
import type { PasswordHasher } from "../src/security/passwords.ts";
import { verifyLoginChallenge } from "../src/security/signedArtifacts.ts";
import { createAuthService } from "../src/services/authService.ts";

const now = new Date("2026-07-28T00:00:00.000Z");
const loginChallengeSecret = "login-challenge-test-secret-at-least-32-bytes";

function createDependencies(
  user: LoginUserRecord,
  options: {
    registerResult?: ChallengeConsumptionResult;
    userExists?: boolean;
  } = {},
) {
  let currentUser = user;
  let emailChallengeCreationCalls = 0;
  let inviteRedemptionCalls = 0;
  let sessionIssueCalls = 0;
  const passwordHasher: PasswordHasher = {
    hash: async (password) => `hash:${password}`,
    verify: async () => true,
  };
  const repository = {
    createEmailChallenge: async () => {
      emailChallengeCreationCalls += 1;
      return true;
    },
    registerUser: async () => options.registerResult ?? ("CONSUMED" as const),
    resetPassword: async () => "CONSUMED" as const,
    userExists: async () => options.userExists ?? true,
    findUserByEmail: async () => currentUser,
    redeemInvite: async () => {
      inviteRedemptionCalls += 1;
      return {
        kind: "REDEEMED" as const,
        entitlement: {
          durationDays: 30 as const,
          startsAt: now,
          endsAt: new Date("2026-08-27T00:00:00.000Z"),
        },
      };
    },
    issueSession: async () => {
      sessionIssueCalls += 1;
      throw new Error("session issuance was not expected");
    },
    findSessionByAccessDigest: async () => null,
    rotateSession: async () => null,
    countActiveDevices: async () => 0,
    revokeSession: async () => undefined,
    recordAuditEvent: async () => undefined,
  };

  return {
    createService: () =>
      createAuthService({
        repository,
        config: {
          emailCodePepper: "email-code-test-pepper-at-least-32-bytes",
          inviteCodePepper: "invite-code-test-pepper-at-least-32-bytes",
          tokenPepper: "token-test-pepper-at-least-32-bytes",
          loginChallengeSecret,
          offlineLeasePrivateKeyPem: "unused-in-these-tests",
        },
        passwordHasher,
      }),
    setUser: (nextUser: LoginUserRecord) => {
      currentUser = nextUser;
    },
    getEmailChallengeCreationCalls: () => emailChallengeCreationCalls,
    getInviteRedemptionCalls: () => inviteRedemptionCalls,
    getSessionIssueCalls: () => sessionIssueCalls,
  };
}

function createUser(entitlement: LoginUserRecord["entitlement"]): LoginUserRecord {
  return {
    id: "user-1",
    email: "learner@example.com",
    passwordHash: "hash:Quant#2026",
    authVersion: 0,
    disabledAt: null,
    entitlement,
  };
}

test("registration requests send an ownership code without exposing account existence", async () => {
  const dependencies = createDependencies(createUser(null), {
    userExists: true,
  });
  const service = await dependencies.createService();

  const result = await service.requestRegistrationCode("learner@example.com", {
    now,
    sourceIp: "127.0.0.1",
  });

  assert.deepEqual(result, { accepted: true, retryAfterSeconds: 60 });
  assert.equal(dependencies.getEmailChallengeCreationCalls(), 1);
});

test("verified duplicate registration reports that the account already exists", async () => {
  const dependencies = createDependencies(createUser(null), {
    registerResult: "USER_ALREADY_EXISTS",
  });
  const service = await dependencies.createService();

  await assert.rejects(
    () =>
      service.register(
        {
          email: "learner@example.com",
          emailCode: "123456",
          password: "Quant#2026",
        },
        { now, sourceIp: "127.0.0.1" },
      ),
    (error: unknown) => error instanceof AuthDomainError && error.code === "ACCOUNT_ALREADY_EXISTS",
  );
});

test("login never issues a session before an invite has established entitlement", async () => {
  const dependencies = createDependencies(createUser(null));
  const service = await dependencies.createService();

  const result = await service.login(
    { email: "learner@example.com", password: "Quant#2026" },
    { deviceId: "device-1234", deviceLabel: "Windows desktop" },
    { now, sourceIp: "127.0.0.1" },
  );

  assert.equal(result.kind, "INVITE_REQUIRED");
  assert.equal(dependencies.getSessionIssueCalls(), 0);
  if (result.kind === "INVITE_REQUIRED") {
    const claims = verifyLoginChallenge(result.loginChallenge, loginChallengeSecret, now);
    assert.equal(claims.authVersion, 0);
    assert.equal(claims.reason, "INVITE_REQUIRED");
  }
});

test("expired entitlement returns a renewal challenge without issuing a session", async () => {
  const dependencies = createDependencies(
    createUser({
      durationDays: 7,
      startsAt: new Date("2026-07-20T00:00:00.000Z"),
      endsAt: new Date("2026-07-27T00:00:00.000Z"),
    }),
  );
  const service = await dependencies.createService();

  const result = await service.login(
    { email: "learner@example.com", password: "Quant#2026" },
    { deviceId: "device-1234", deviceLabel: "Windows desktop" },
    { now, sourceIp: "127.0.0.1" },
  );

  assert.equal(result.kind, "ENTITLEMENT_EXPIRED");
  assert.equal(dependencies.getSessionIssueCalls(), 0);
});

test("password-version changes invalidate an outstanding invite challenge", async () => {
  const originalUser = createUser(null);
  const dependencies = createDependencies(originalUser);
  const service = await dependencies.createService();
  const loginResult = await service.login(
    { email: "learner@example.com", password: "Quant#2026" },
    { deviceId: "device-1234", deviceLabel: "Windows desktop" },
    { now, sourceIp: "127.0.0.1" },
  );
  assert.equal(loginResult.kind, "INVITE_REQUIRED");
  if (loginResult.kind !== "INVITE_REQUIRED") {
    return;
  }
  dependencies.setUser({ ...originalUser, authVersion: 1 });

  await assert.rejects(
    () =>
      service.redeemInviteWithChallenge(
        {
          loginChallenge: loginResult.loginChallenge,
          inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
        },
        { deviceId: "device-1234", deviceLabel: "Windows desktop" },
        { now, sourceIp: "127.0.0.1" },
      ),
    (error: unknown) => error instanceof AuthDomainError && error.code === "ACCESS_DENIED",
  );
  assert.equal(dependencies.getInviteRedemptionCalls(), 0);
  assert.equal(dependencies.getSessionIssueCalls(), 0);
});
