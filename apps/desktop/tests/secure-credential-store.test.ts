import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryPersistenceStore } from "../src/electron/localPersistence.ts";
import { createSecureCredentialStore, type SecureCredentialCrypto } from "../src/electron/secureCredentialStore.ts";

function createTestCrypto(overrides: Partial<SecureCredentialCrypto> = {}): SecureCredentialCrypto {
  return {
    encrypt: (value) => Buffer.from(`sealed:${value}`, "utf8").toString("base64"),
    decrypt: (value) => {
      const rawValue = Buffer.from(value, "base64").toString("utf8");
      if (!rawValue.startsWith("sealed:")) {
        throw new Error("bad payload");
      }

      return rawValue.slice("sealed:".length);
    },
    isEncryptionAvailable: () => true,
    ...overrides,
  };
}

test("secure credential store saves encrypted AlphaFeed credentials", () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  secureStore.saveAlphaFeedCredentials({
    apiUrl: " https://api.alphafeed.org ",
    apiKey: " alpha-secret ",
  });

  const rawValue = store.getItem("secure-credentials.alphafeed") ?? "";
  assert.match(rawValue, /encryptedPayload/);
  assert.doesNotMatch(rawValue, /alpha-secret/);
  assert.deepEqual(secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "alpha-secret",
  });
});

test("secure credential store saves encrypted LongBridge credentials", () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  secureStore.saveLongPortCredentials({
    apiUrl: "https://openapi.longportapp.com",
    appKey: "app-key",
    appSecret: "app-secret",
    accessToken: "access-token",
  });

  const rawValue = store.getItem("secure-credentials.longport") ?? "";
  assert.doesNotMatch(rawValue, /app-secret/);
  assert.deepEqual(secureStore.readLongPortCredentials(), {
    apiUrl: "https://openapi.longportapp.com",
    appKey: "app-key",
    appSecret: "app-secret",
    accessToken: "access-token",
  });
});

test("secure credential store saves encrypted AlphaFeed stream credentials", () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  secureStore.saveAlphaFeedStreamCredentials({
    wsUrl: " wss://api.tickflow.org/v1/ws/stream ",
    apiKey: " stream-secret ",
  });

  const rawValue = store.getItem("secure-credentials.alphafeed-stream") ?? "";
  assert.match(rawValue, /encryptedPayload/);
  assert.doesNotMatch(rawValue, /stream-secret/);
  assert.deepEqual(secureStore.readAlphaFeedStreamCredentials(), {
    wsUrl: "wss://api.tickflow.org/v1/ws/stream",
    apiKey: "stream-secret",
  });
});

test("secure credential store clears AlphaFeed stream credentials independently", () => {
  const store = createMemoryPersistenceStore();
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  secureStore.saveAlphaFeedCredentials({
    apiUrl: "https://api.alphafeed.org",
    apiKey: "rest-secret",
  });
  secureStore.saveAlphaFeedStreamCredentials({
    wsUrl: "wss://api.tickflow.org/v1/ws/stream",
    apiKey: "stream-secret",
  });

  secureStore.clearAlphaFeedStreamCredentials();

  assert.equal(secureStore.readAlphaFeedStreamCredentials(), null);
  assert.deepEqual(secureStore.readAlphaFeedCredentials(), {
    apiUrl: "https://api.alphafeed.org",
    apiKey: "rest-secret",
  });
});

test("secure credential store rejects saves when encryption is unavailable", () => {
  const secureStore = createSecureCredentialStore(
    createMemoryPersistenceStore(),
    createTestCrypto({
      isEncryptionAvailable: () => false,
    }),
  );

  assert.throws(
    () =>
      secureStore.saveAlphaFeedCredentials({
        apiUrl: "https://api.alphafeed.org",
        apiKey: "alpha-secret",
      }),
    /安全凭据加密/,
  );
});

test("secure credential store returns null for malformed encrypted payloads", () => {
  const store = createMemoryPersistenceStore({
    "secure-credentials.alphafeed": JSON.stringify({
      version: 1,
      provider: "alphafeed",
      encryptedPayload: "not-base64",
      updatedAt: "2026-07-01T00:00:00.000Z",
    }),
  });
  const secureStore = createSecureCredentialStore(store, createTestCrypto());

  assert.equal(secureStore.readAlphaFeedCredentials(), null);
});
