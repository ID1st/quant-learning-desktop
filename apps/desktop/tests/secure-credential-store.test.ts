import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryPersistenceStore } from "../src/electron/localPersistence.ts";
import {
  createSecureCredentialStore,
  type SecureCredentialCrypto,
} from "../src/electron/secureCredentialStore.ts";

function createTestCrypto(overrides: Partial<SecureCredentialCrypto> = {}): SecureCredentialCrypto {
  return {
    encrypt: async (value) => Buffer.from(`sealed:${value}`, "utf8").toString("base64"),
    decrypt: async (value) => {
      const rawValue = Buffer.from(value, "base64").toString("utf8");
      if (!rawValue.startsWith("sealed:")) {
        throw new Error("bad payload");
      }

      return rawValue.slice("sealed:".length);
    },
    isEncryptionAvailable: async () => true,
    ...overrides,
  };
}

test("secure credential store saves encrypted AlphaFeed credentials", async () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  await secureStore.saveAlphaFeedCredentials({
    apiUrl: " https://api.alphafeed.org ",
    apiKey: " alpha-secret ",
  });

  const rawValue = store.getItem("secure-credentials.alphafeed") ?? "";
  assert.match(rawValue, /encryptedPayload/);
  assert.doesNotMatch(rawValue, /alpha-secret/);
  assert.deepEqual(await secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "alpha-secret",
  });
});

test("secure credential store keeps legacy AlphaFeed credentials inactive until explicitly re-saved", async () => {
  const store = createMemoryPersistenceStore();
  const crypto = createTestCrypto();
  const encryptedPayload = await crypto.encrypt(
    JSON.stringify({
      apiUrl: "https://api.alphafeed.org",
      apiKey: "legacy-alpha-secret",
    }),
  );
  store.setItem(
    "secure-credentials.alphafeed",
    JSON.stringify({
      version: 1,
      provider: "alphafeed",
      encryptedPayload,
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
  );
  const secureStore = createSecureCredentialStore(store, crypto);

  assert.equal(await secureStore.readAlphaFeedCredentials(), null);

  await secureStore.saveAlphaFeedCredentials({
    apiUrl: "https://api.alphafeed.org",
    apiKey: "new-alpha-secret",
  });
  assert.deepEqual(await secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "new-alpha-secret",
  });
});

test("secure credential store saves encrypted LongBridge credentials", async () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  await secureStore.saveLongPortCredentials({
    apiUrl: "https://openapi.longportapp.com",
    appKey: "app-key",
    appSecret: "app-secret",
    accessToken: "access-token",
  });

  const rawValue = store.getItem("secure-credentials.longport") ?? "";
  assert.doesNotMatch(rawValue, /app-secret/);
  assert.deepEqual(await secureStore.readLongPortCredentials(), {
    apiUrl: "https://openapi.longportapp.com",
    appKey: "app-key",
    appSecret: "app-secret",
    accessToken: "access-token",
  });
});

test("secure credential store keeps legacy LongBridge credentials inactive until explicitly re-saved", async () => {
  const store = createMemoryPersistenceStore();
  const crypto = createTestCrypto();
  const encryptedPayload = await crypto.encrypt(
    JSON.stringify({
      apiUrl: "https://openapi.longportapp.com",
      appKey: "legacy-app-key",
      appSecret: "legacy-app-secret",
      accessToken: "legacy-access-token",
    }),
  );
  store.setItem(
    "secure-credentials.longport",
    JSON.stringify({
      version: 1,
      provider: "longport",
      encryptedPayload,
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
  );
  const secureStore = createSecureCredentialStore(store, crypto);

  assert.equal(await secureStore.readLongPortCredentials(), null);

  await secureStore.saveLongPortCredentials({
    apiUrl: "https://openapi.longportapp.com",
    appKey: "new-app-key",
    appSecret: "new-app-secret",
    accessToken: "new-access-token",
  });
  assert.deepEqual(await secureStore.readLongPortCredentials(), {
    apiUrl: "https://openapi.longportapp.com",
    appKey: "new-app-key",
    appSecret: "new-app-secret",
    accessToken: "new-access-token",
  });
});

test("secure credential store saves encrypted AlphaFeed stream credentials", async () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  await secureStore.saveAlphaFeedStreamCredentials({
    wsUrl: " wss://api.tickflow.org/v1/ws/stream ",
    apiKey: " stream-secret ",
  });

  const rawValue = store.getItem("secure-credentials.alphafeed-stream") ?? "";
  assert.match(rawValue, /encryptedPayload/);
  assert.doesNotMatch(rawValue, /stream-secret/);
  assert.deepEqual(await secureStore.readAlphaFeedStreamCredentials(), {
    wsUrl: "wss://api.tickflow.org/v1/ws/stream",
    apiKey: "stream-secret",
  });
});

test("secure credential store clears AlphaFeed stream credentials independently", async () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  await secureStore.saveAlphaFeedCredentials({
    apiUrl: "https://api.alphafeed.org",
    apiKey: "rest-secret",
  });
  await secureStore.saveAlphaFeedStreamCredentials({
    wsUrl: "wss://api.tickflow.org/v1/ws/stream",
    apiKey: "stream-secret",
  });

  secureStore.clearAlphaFeedStreamCredentials();

  assert.equal(await secureStore.readAlphaFeedStreamCredentials(), null);
  assert.deepEqual(await secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "rest-secret",
  });
});

test("secure credential store rejects saves when encryption is unavailable", async () => {
  const secureStore = createSecureCredentialStore(
    createMemoryPersistenceStore(),
    createTestCrypto({
      isEncryptionAvailable: async () => false,
    }),
  );

  await assert.rejects(
    () =>
      secureStore.saveAlphaFeedCredentials({
        apiUrl: "https://api.alphafeed.org",
        apiKey: "alpha-secret",
      }),
    /安全凭据加密/,
  );
});

test("secure credential store returns null for malformed encrypted payloads", async () => {
  const store = createMemoryPersistenceStore({
    "secure-credentials.alphafeed": JSON.stringify({
      version: 1,
      provider: "alphafeed",
      encryptedPayload: "not-base64",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
  });
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  assert.equal(await secureStore.readAlphaFeedCredentials(), null);
});

test("stalled Keychain credential reads keep the event loop responsive and degrade to no credentials", async () => {
  const store = createMemoryPersistenceStore({
    "secure-credentials.alphafeed": JSON.stringify({
      version: 1,
      provider: "alphafeed",
      encryptedPayload: "stalled-payload",
      updatedAt: "2026-07-01T00:00:00.000Z",
      activatedAt: "2026-07-01T00:00:00.000Z",
    }),
  });
  let heartbeat = false;
  let decryptCalls = 0;
  const secureStore = createSecureCredentialStore(
    store,
    {
      isEncryptionAvailable: async () => true,
      encrypt: async () => "unused",
      decrypt: () => {
        decryptCalls += 1;
        return new Promise<never>(() => undefined);
      },
    },
    { operationTimeoutMilliseconds: 10 },
  );

  setTimeout(() => {
    heartbeat = true;
  }, 0);
  assert.equal(await secureStore.readAlphaFeedCredentials(), null);
  assert.equal(heartbeat, true);
  assert.equal(await secureStore.readAlphaFeedCredentials(), null);
  assert.equal(decryptCalls, 1);
});

test("stalled macOS Keychain saves fall back to current-session credentials without writing secrets", async () => {
  const store = createMemoryPersistenceStore();
  let heartbeat = false;
  const secureStore = createSecureCredentialStore(
    store,
    createTestCrypto({
      encrypt: () => new Promise<never>(() => undefined),
    }),
    {
      operationTimeoutMilliseconds: 10,
      allowMemoryFallback: true,
    },
  );

  setTimeout(() => {
    heartbeat = true;
  }, 0);
  const persistence = await secureStore.saveAlphaFeedCredentials({
    apiUrl: " https://api.alphafeed.org ",
    apiKey: " alpha-session-secret ",
  });

  assert.deepEqual(persistence, { persistence: "memory" });
  assert.equal(heartbeat, true);
  assert.equal(store.getItem("secure-credentials.alphafeed"), null);
  assert.deepEqual(await secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "alpha-session-secret",
  });

  secureStore.clearAlphaFeedCredentials();
  assert.equal(await secureStore.readAlphaFeedCredentials(), null);
});

test("secure credential saves report durable system storage", async () => {
  const secureStore = createSecureCredentialStore(
    createMemoryPersistenceStore(),
    createTestCrypto(),
    { allowMemoryFallback: true },
  );

  assert.deepEqual(
    await secureStore.saveLongPortCredentials({
      apiUrl: "https://openapi.longportapp.com",
      appKey: "app-key",
      appSecret: "app-secret",
      accessToken: "access-token",
    }),
    { persistence: "secure" },
  );
});

test("successfully decrypted credentials are reused for the rest of the process", async () => {
  const store = createMemoryPersistenceStore();
  const crypto = createTestCrypto();
  const encryptedPayload = await crypto.encrypt(
    JSON.stringify({ apiUrl: "https://api.alphafeed.org", apiKey: "cached-alpha-secret" }),
  );
  store.setItem(
    "secure-credentials.alphafeed",
    JSON.stringify({
      version: 1,
      provider: "alphafeed",
      encryptedPayload,
      updatedAt: "2026-09-21T00:00:00.000Z",
      activatedAt: "2026-09-21T00:00:00.000Z",
    }),
  );
  let decryptCalls = 0;
  const secureStore = createSecureCredentialStore(
    store,
    createTestCrypto({
      decrypt: async (value) => {
        decryptCalls += 1;
        const rawValue = Buffer.from(value, "base64").toString("utf8");
        return rawValue.slice("sealed:".length);
      },
    }),
  );

  await secureStore.readAlphaFeedCredentials();
  await secureStore.readAlphaFeedCredentials();

  assert.equal(decryptCalls, 1);
});
