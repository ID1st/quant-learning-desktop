import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  CloudAuthClientError,
  type CloudAuthClient,
  type CloudSessionBundle,
} from "../../../packages/api-client/src/auth.ts";
import { createOfflineLease } from "../../cloud-server/src/security/signedArtifacts.ts";
import {
  createAuthSessionManager,
  type AuthSessionManager,
} from "../src/electron/authSessionManager.ts";
import {
  createAuthTokenStore,
  type AuthEncryptedPersistence,
  type AuthTokenCrypto,
} from "../src/electron/authTokenStore.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;
const publicKeyPem = publicKey.export({
  format: "pem",
  type: "spki",
}) as string;

const onlineBundle: CloudSessionBundle = {
  accessToken: "qat_access-secret",
  refreshToken: "qrt_refresh-secret",
  offlineLease: createOfflineLease(
    {
      userId: "user-1",
      email: "learner@example.com",
      deviceId: "device-1234",
      entitlementDurationDays: 30,
      entitlementEndsAt: "2026-08-27T00:00:00.000Z",
      offlineUntil: "2026-07-29T00:00:00.000Z",
      issuedAt: "2026-07-28T00:00:00.000Z",
    },
    privateKeyPem,
  ),
  session: {
    userId: "user-1",
    email: "learner@example.com",
    accessStatus: "ACTIVE",
    entitlementDurationDays: 30,
    entitlementEndsAt: "2026-08-27T00:00:00.000Z",
    offlineUntil: "2026-07-29T00:00:00.000Z",
    deviceId: "device-1234",
    activeDeviceCount: 1,
    lastValidatedAt: "2026-07-28T00:00:00.000Z",
    isOffline: false,
  },
};

function createStore() {
  let rawValue: string | null = null;
  const persistence: AuthEncryptedPersistence = {
    read: async () => rawValue,
    write: async (value) => {
      rawValue = value;
    },
    remove: async () => {
      rawValue = null;
    },
  };
  const crypto: AuthTokenCrypto = {
    isEncryptionAvailable: () => true,
    encrypt: async (value) => Buffer.from(value, "utf8").toString("base64"),
    decrypt: async (value) => Buffer.from(value, "base64").toString("utf8"),
  };
  return createAuthTokenStore(persistence, crypto);
}

function createClient(overrides: Partial<CloudAuthClient>): CloudAuthClient {
  const notImplemented = async (): Promise<never> => {
    throw new Error("unexpected client call");
  };
  return {
    requestRegistrationCode: notImplemented,
    register: notImplemented,
    login: notImplemented,
    redeemInvite: notImplemented,
    renewEntitlement: notImplemented,
    refreshSession: notImplemented,
    logout: notImplemented,
    requestPasswordReset: notImplemented,
    resetPassword: notImplemented,
    getSession: notImplemented,
    ...overrides,
  };
}

function createManager(
  client: CloudAuthClient,
  store = createStore(),
  now = () => new Date("2026-07-28T12:00:00.000Z"),
): AuthSessionManager {
  return createAuthSessionManager({
    client,
    tokenStore: store,
    device: {
      deviceId: "device-1234",
      deviceLabel: "Windows desktop",
    },
    offlinePublicKeyPem: publicKeyPem,
    now,
  });
}

test("verified login survives a stalled Keychain write without persisting plaintext", async () => {
  let writes = 0;
  let raw: string | null = "old encrypted session";
  let finishEncryption!: (value: string) => void;
  const store = createAuthTokenStore(
    {
      read: async () => raw,
      write: async (value) => {
        writes++;
        raw = value;
      },
      remove: async () => {
        raw = null;
      },
    },
    {
      isEncryptionAvailable: () => true,
      encrypt: () =>
        new Promise((resolve) => {
          finishEncryption = resolve;
        }),
      decrypt: async () => {
        throw new Error("unavailable");
      },
    },
    { restoreTimeoutMilliseconds: 10, allowMemoryOnlySession: true },
  );
  const manager = createManager(
    createClient({
      login: async () => ({ kind: "AUTHENTICATED", bundle: onlineBundle }),
    }),
    store,
  );
  const result = await manager.login({ email: "learner@example.com", password: "test-password" });
  assert.equal(result.ok, true);
  assert.equal(store.getAccessToken(), onlineBundle.accessToken);
  assert.equal(raw, null);
  finishEncryption("late encrypted result");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(writes, 0);
  await store.clear();
  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.restore(), null);
});

test("login during background restoration waits before writing a new session", async () => {
  const store = createStore();
  let finishRestore!: () => void;
  let loggedIn = false;
  store.restore = () =>
    new Promise((resolve) => {
      finishRestore = () => resolve(null);
    });
  const manager = createManager(
    createClient({
      login: async () => {
        loggedIn = true;
        return { kind: "AUTHENTICATED", bundle: onlineBundle };
      },
    }),
    store,
  );
  const restoration = manager.bootstrap();
  const login = manager.login({ email: "learner@example.com", password: "test-password" });
  await Promise.resolve();
  assert.equal(loggedIn, false);
  finishRestore();
  await restoration;
  assert.equal((await login).ok, true);
  assert.equal(loggedIn, true);
  assert.equal(store.getAccessToken(), onlineBundle.accessToken);
});

test("bootstrap refreshes an encrypted session before exposing the workspace", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const manager = createManager(
    createClient({
      refreshSession: async () => onlineBundle,
    }),
    store,
  );

  const result = await manager.bootstrap();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "AUTHENTICATED_ONLINE");
  assert.equal(result.ok && result.data.session?.isOffline, false);
  assert.equal(store.getAccessToken(), "qat_access-secret");
});

test("revalidate before bootstrap restores persisted authentication instead of clearing it", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let refreshCalls = 0;
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        refreshCalls += 1;
        return onlineBundle;
      },
    }),
    store,
  );

  const result = await manager.revalidate();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "AUTHENTICATED_ONLINE");
  assert.equal(refreshCalls, 1);
  assert.equal(store.getAccessToken(), "qat_access-secret");
});

test("lifecycle revalidation leaves signed-out authentication flows unchanged", async () => {
  const manager = createManager(createClient({}));
  await manager.bootstrap();
  let publishedStates = 0;
  const unsubscribe = manager.subscribe(() => {
    publishedStates += 1;
  });

  const result = await manager.revalidate();
  unsubscribe();

  assert.deepEqual(result, {
    ok: true,
    data: {
      phase: "SIGNED_OUT",
      session: null,
      errorCode: null,
    },
  });
  assert.equal(publishedStates, 0);
});

test("concurrent bootstrap and lifecycle revalidation share one refresh", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshCalls = 0;
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        refreshCalls += 1;
        await refreshGate;
        return onlineBundle;
      },
    }),
    store,
  );

  const bootstrap = manager.bootstrap();
  const lifecycleRevalidation = manager.revalidate();
  releaseRefresh?.();
  const [bootstrapResult, revalidationResult] = await Promise.all([
    bootstrap,
    lifecycleRevalidation,
  ]);

  assert.equal(bootstrapResult.ok, true);
  assert.equal(revalidationResult.ok, true);
  assert.equal(refreshCalls, 1);
  assert.equal(revalidationResult.ok && revalidationResult.data.phase, "AUTHENTICATED_ONLINE");
});

test("concurrent authenticated revalidations share one rotating refresh token", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let refreshCalls = 0;
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        refreshCalls += 1;
        if (refreshCalls > 1) {
          await refreshGate;
        }
        return onlineBundle;
      },
      getSession: async () => {
        throw new CloudAuthClientError("SESSION_REVOKED", "access token expired");
      },
    }),
    store,
  );
  await manager.bootstrap();

  const first = manager.revalidate();
  const second = manager.revalidate();
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseRefresh?.();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(refreshCalls, 2);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.ok && firstResult.data.phase, "AUTHENTICATED_ONLINE");
});

test("logout supersedes an in-flight revalidation result", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let releaseRefresh: (() => void) | undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshCalls = 0;
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        refreshCalls += 1;
        if (refreshCalls > 1) {
          await refreshGate;
        }
        return onlineBundle;
      },
      getSession: async () => {
        throw new CloudAuthClientError("SESSION_REVOKED", "access token expired");
      },
      logout: async () => ({ signedOut: true }),
    }),
    store,
  );
  await manager.bootstrap();

  const revalidation = manager.revalidate();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await manager.logout();
  releaseRefresh?.();
  const result = await revalidation;
  const snapshot = await manager.getSnapshot();

  assert.equal(result.ok, true);
  assert.equal(snapshot.ok && snapshot.data.phase, "SIGNED_OUT");
  assert.equal(store.getAccessToken(), null);
});

test("bootstrap falls back to a signed lease only for network failures", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        throw new CloudAuthClientError("NETWORK_UNAVAILABLE", "network unavailable");
      },
    }),
    store,
  );

  const result = await manager.bootstrap();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "AUTHENTICATED_OFFLINE");
  assert.equal(result.ok && result.data.session?.isOffline, true);
});

test("an online session moves to its signed offline lease when the network drops", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const manager = createManager(
    createClient({
      refreshSession: async () => onlineBundle,
      getSession: async () => {
        throw new CloudAuthClientError("NETWORK_UNAVAILABLE", "network unavailable");
      },
    }),
    store,
  );
  await manager.bootstrap();

  const result = await manager.revalidate();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "AUTHENTICATED_OFFLINE");
  assert.equal(result.ok && result.data.session?.isOffline, true);
});

test("offline revalidation enters the entitlement-expired phase at the qualification deadline", async () => {
  let currentTime = new Date("2026-07-28T12:00:00.000Z");
  const expiringBundle: CloudSessionBundle = {
    ...onlineBundle,
    offlineLease: createOfflineLease(
      {
        userId: "user-1",
        email: "learner@example.com",
        deviceId: "device-1234",
        entitlementDurationDays: 30,
        entitlementEndsAt: "2026-07-28T12:30:00.000Z",
        offlineUntil: "2026-07-28T12:30:00.000Z",
        issuedAt: "2026-07-28T12:00:00.000Z",
      },
      privateKeyPem,
    ),
    session: {
      ...onlineBundle.session,
      entitlementEndsAt: "2026-07-28T12:30:00.000Z",
      offlineUntil: "2026-07-28T12:30:00.000Z",
      lastValidatedAt: "2026-07-28T12:00:00.000Z",
    },
  };
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: expiringBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T12:00:00.000Z",
  });
  const manager = createManager(
    createClient({
      refreshSession: async () => expiringBundle,
      getSession: async () => {
        throw new CloudAuthClientError("NETWORK_UNAVAILABLE", "network unavailable");
      },
    }),
    store,
    () => currentTime,
  );
  await manager.bootstrap();
  currentTime = new Date("2026-07-28T13:00:00.000Z");

  const result = await manager.revalidate();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "ENTITLEMENT_EXPIRED");
  assert.equal(result.ok && result.data.session, null);
});

test("revalidation refreshes when the short-lived access token has expired", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let refreshCalls = 0;
  const manager = createManager(
    createClient({
      refreshSession: async () => {
        refreshCalls += 1;
        return onlineBundle;
      },
      getSession: async () => {
        throw new CloudAuthClientError("SESSION_REVOKED", "access token expired");
      },
    }),
    store,
  );
  await manager.bootstrap();

  const result = await manager.revalidate();

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.phase, "AUTHENTICATED_ONLINE");
  assert.equal(refreshCalls, 2);
});

test("login challenge remains in the manager and is consumed during invite redemption", async () => {
  let observedChallenge = "";
  const manager = createManager(
    createClient({
      login: async () => ({
        kind: "INVITE_REQUIRED",
        loginChallenge: "main-process-only-challenge",
      }),
      redeemInvite: async (input) => {
        observedChallenge = input.loginChallenge;
        return onlineBundle;
      },
    }),
  );

  const loginResult = await manager.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });
  assert.deepEqual(loginResult, {
    ok: true,
    data: { kind: "INVITE_REQUIRED" },
  });
  assert.equal(
    JSON.stringify(await manager.getSnapshot()).includes("main-process-only-challenge"),
    false,
  );

  const redemption = await manager.redeemInvite({
    inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
  });
  assert.equal(observedChallenge, "main-process-only-challenge");
  assert.equal(redemption.ok, true);
  assert.equal(redemption.ok && redemption.data.userId, "user-1");
});

test("lifecycle revalidation preserves an unfinished invite challenge", async () => {
  let observedChallenge = "";
  const manager = createManager(
    createClient({
      login: async () => ({
        kind: "INVITE_REQUIRED",
        loginChallenge: "focus-safe-login-challenge",
      }),
      redeemInvite: async (input) => {
        observedChallenge = input.loginChallenge;
        return onlineBundle;
      },
    }),
  );
  await manager.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });

  const revalidation = await manager.revalidate();
  const redemption = await manager.redeemInvite({
    inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
  });

  assert.equal(revalidation.ok, true);
  assert.equal(revalidation.ok && revalidation.data.phase, "INVITE_REQUIRED");
  assert.equal(observedChallenge, "focus-safe-login-challenge");
  assert.equal(redemption.ok, true);
});

test("registration and password-reset operations publish safe phases and clear authentication", async () => {
  const publishedPhases: string[] = [];
  const manager = createManager(
    createClient({
      requestRegistrationCode: async () => ({ accepted: true, retryAfterSeconds: 60 }),
      register: async ({ email }) => ({ email }),
      requestPasswordReset: async () => ({ accepted: true, retryAfterSeconds: 30 }),
      resetPassword: async () => ({ sessionsRevoked: true }),
    }),
  );
  const unsubscribe = manager.subscribe((snapshot) => publishedPhases.push(snapshot.phase));

  assert.deepEqual(await manager.requestRegistrationCode({ email: "learner@example.com" }), {
    ok: true,
    data: { accepted: true, retryAfterSeconds: 60 },
  });
  assert.deepEqual(
    await manager.register({
      email: "learner@example.com",
      emailCode: "123456",
      password: "Quant#2026",
    }),
    {
      ok: true,
      data: { email: "learner@example.com" },
    },
  );
  assert.deepEqual(await manager.requestPasswordReset({ email: "learner@example.com" }), {
    ok: true,
    data: { accepted: true, retryAfterSeconds: 30 },
  });
  assert.deepEqual(
    await manager.resetPassword({
      email: "learner@example.com",
      emailCode: "654321",
      password: "Reset#2026",
    }),
    {
      ok: true,
      data: { sessionsRevoked: true },
    },
  );
  unsubscribe();

  assert.deepEqual(publishedPhases, ["LOGIN", "LOGIN"]);
  assert.equal((await manager.getSnapshot()).ok, true);
});

test("authentication operation failures expose stable safe error details", async () => {
  const rateLimited = new CloudAuthClientError("RATE_LIMITED", "try later", 45);
  const manager = createManager(
    createClient({
      requestRegistrationCode: async () => {
        throw rateLimited;
      },
      register: async () => {
        throw new Error("database detail");
      },
      requestPasswordReset: async () => {
        throw rateLimited;
      },
      resetPassword: async () => {
        throw new Error("secret detail");
      },
    }),
  );

  assert.deepEqual(await manager.requestRegistrationCode({ email: "learner@example.com" }), {
    ok: false,
    error: {
      code: "RATE_LIMITED",
      message: "try later",
      retryAfterSeconds: 45,
    },
  });
  assert.deepEqual(
    await manager.register({
      email: "learner@example.com",
      emailCode: "123456",
      password: "Quant#2026",
    }),
    {
      ok: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Authentication operation failed",
      },
    },
  );
  assert.equal((await manager.requestPasswordReset({ email: "learner@example.com" })).ok, false);
  assert.equal(
    (
      await manager.resetPassword({
        email: "learner@example.com",
        emailCode: "654321",
        password: "Reset#2026",
      })
    ).ok,
    false,
  );
});

test("login covers authenticated, expired and denied responses without exposing challenges", async () => {
  const authenticated = createManager(
    createClient({
      login: async () => ({ kind: "AUTHENTICATED", bundle: onlineBundle }),
    }),
  );
  const authenticatedResult = await authenticated.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });
  assert.equal(authenticatedResult.ok && authenticatedResult.data.kind, "AUTHENTICATED");

  const expired = createManager(
    createClient({
      login: async () => ({
        kind: "ENTITLEMENT_EXPIRED",
        expiredAt: "2026-07-01T00:00:00.000Z",
        loginChallenge: "renewal-only-challenge",
      }),
    }),
  );
  assert.deepEqual(
    await expired.login({
      email: "learner@example.com",
      password: "Quant#2026",
    }),
    {
      ok: true,
      data: {
        kind: "ENTITLEMENT_EXPIRED",
        expiredAt: "2026-07-01T00:00:00.000Z",
      },
    },
  );

  const denied = createManager(
    createClient({
      login: async () => ({ kind: "ACCESS_DENIED" }),
    }),
  );
  assert.deepEqual(
    await denied.login({
      email: "learner@example.com",
      password: "Quant#2026",
    }),
    {
      ok: true,
      data: { kind: "ACCESS_DENIED" },
    },
  );
});

test("invite redemption requires a challenge and renewal supports challenge and access-token paths", async () => {
  const missingChallenge = createManager(createClient({}));
  assert.deepEqual(
    await missingChallenge.redeemInvite({
      inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
    }),
    {
      ok: false,
      error: {
        code: "ACCESS_DENIED",
        message: "A verified login challenge is required",
      },
    },
  );

  let challengeRenewalInput: { loginChallenge?: string; accessToken?: string } | undefined;
  const challengeRenewal = createManager(
    createClient({
      login: async () => ({
        kind: "ENTITLEMENT_EXPIRED",
        expiredAt: "2026-07-01T00:00:00.000Z",
        loginChallenge: "renewal-challenge",
      }),
      renewEntitlement: async (request) => {
        challengeRenewalInput = request;
        return onlineBundle;
      },
    }),
  );
  await challengeRenewal.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });
  assert.equal(
    (
      await challengeRenewal.renewEntitlement({
        inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
      })
    ).ok,
    true,
  );
  assert.equal(challengeRenewalInput?.loginChallenge, "renewal-challenge");
  assert.equal(challengeRenewalInput?.accessToken, undefined);

  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let accessTokenRenewalInput: { loginChallenge?: string; accessToken?: string } | undefined;
  const accessTokenRenewal = createManager(
    createClient({
      refreshSession: async () => onlineBundle,
      renewEntitlement: async (request) => {
        accessTokenRenewalInput = request;
        return {
          session: {
            ...onlineBundle.session,
            lastValidatedAt: "2026-07-28T01:00:00.000Z",
          },
          offlineLease: onlineBundle.offlineLease,
        };
      },
    }),
    store,
  );
  await accessTokenRenewal.bootstrap();
  const renewed = await accessTokenRenewal.renewEntitlement({
    inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
  });
  assert.equal(renewed.ok, true);
  assert.equal(accessTokenRenewalInput?.accessToken, "qat_access-secret");
});

test("bootstrap rejects mismatched devices and reports invalid offline fallback safely", async () => {
  const mismatchedStore = createStore();
  await mismatchedStore.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "other-device",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const mismatched = await createManager(createClient({}), mismatchedStore).bootstrap();
  assert.equal(mismatched.ok && mismatched.data.phase, "SIGNED_OUT");
  assert.equal(mismatchedStore.getAccessToken(), null);

  const invalidLeaseStore = createStore();
  const [leasePayload, leaseSignature] = onlineBundle.offlineLease.split(".");
  const tamperedOfflineLease = `${leasePayload}.${
    leaseSignature!.startsWith("A") ? "B" : "A"
  }${leaseSignature!.slice(1)}`;
  await invalidLeaseStore.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: tamperedOfflineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const unavailable = await createManager(
    createClient({
      refreshSession: async () => {
        throw new CloudAuthClientError("NETWORK_UNAVAILABLE", "offline");
      },
    }),
    invalidLeaseStore,
  ).bootstrap();
  assert.equal(unavailable.ok && unavailable.data.phase, "SERVICE_UNAVAILABLE");
  assert.equal(unavailable.ok && unavailable.data.errorCode, "NETWORK_UNAVAILABLE");
});

test("online validation persists a rotated lease and rejects a mismatched server device", async () => {
  const store = createStore();
  await store.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  let validationCalls = 0;
  const manager = createManager(
    createClient({
      refreshSession: async () => onlineBundle,
      getSession: async () => {
        validationCalls += 1;
        return {
          offlineLease: onlineBundle.offlineLease,
          session: {
            ...onlineBundle.session,
            lastValidatedAt: "2026-07-28T02:00:00.000Z",
          },
        };
      },
    }),
    store,
  );
  await manager.bootstrap();
  assert.equal((await manager.revalidate()).ok, true);
  assert.equal(validationCalls, 1);

  const mismatched = createManager(
    createClient({
      login: async () => ({
        kind: "AUTHENTICATED",
        bundle: {
          ...onlineBundle,
          session: { ...onlineBundle.session, deviceId: "other-device" },
        },
      }),
    }),
  );
  const result = await mismatched.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error.code, "SERVICE_UNAVAILABLE");
});

test("bootstrap, revalidation, redemption and renewal failures keep deterministic phases", async () => {
  const bootstrapStore = createStore();
  await bootstrapStore.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const expiredBootstrap = await createManager(
    createClient({
      refreshSession: async () => {
        throw new CloudAuthClientError("ENTITLEMENT_EXPIRED", "expired");
      },
    }),
    bootstrapStore,
  ).bootstrap();
  assert.equal(expiredBootstrap.ok && expiredBootstrap.data.phase, "ENTITLEMENT_EXPIRED");

  const revalidationStore = createStore();
  await revalidationStore.save({
    accessToken: "old-memory-token",
    refreshToken: "old-refresh-token",
    offlineLease: onlineBundle.offlineLease,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
  const revalidationManager = createManager(
    createClient({
      refreshSession: async () => onlineBundle,
      getSession: async () => {
        throw new CloudAuthClientError("ACCESS_DENIED", "denied");
      },
    }),
    revalidationStore,
  );
  await revalidationManager.bootstrap();
  const denied = await revalidationManager.revalidate();
  assert.equal(denied.ok, false);
  assert.equal((await revalidationManager.getSnapshot()).ok, true);

  const redemptionManager = createManager(
    createClient({
      login: async () => ({
        kind: "INVITE_REQUIRED",
        loginChallenge: "challenge",
      }),
      redeemInvite: async () => {
        throw new CloudAuthClientError("INVITE_INVALID", "invalid invite");
      },
    }),
  );
  await redemptionManager.login({
    email: "learner@example.com",
    password: "Quant#2026",
  });
  assert.equal(
    (
      await redemptionManager.redeemInvite({
        inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
      })
    ).ok,
    false,
  );

  const renewalWithoutSession = createManager(
    createClient({
      renewEntitlement: async () => ({
        session: onlineBundle.session,
        offlineLease: onlineBundle.offlineLease,
      }),
    }),
  );
  const renewal = await renewalWithoutSession.renewEntitlement({
    inviteCode: "QLD-ABCDE-FGHJK-MNPQR",
  });
  assert.equal(renewal.ok, false);
  assert.equal(!renewal.ok && renewal.error.code, "SESSION_REVOKED");
});
