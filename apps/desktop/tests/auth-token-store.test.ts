import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthTokenStore,
  type AuthEncryptedPersistence,
  type AuthTokenCrypto,
} from "../src/electron/authTokenStore.ts";

function createMemoryPersistence(): AuthEncryptedPersistence & {
  readRaw(): string | null;
} {
  let rawValue: string | null = null;
  return {
    read: async () => rawValue,
    write: async (value) => {
      rawValue = value;
    },
    remove: async () => {
      rawValue = null;
    },
    readRaw: () => rawValue,
  };
}

const crypto: AuthTokenCrypto = {
  isEncryptionAvailable: () => true,
  encrypt: async (plaintext) =>
    Buffer.from(`sealed:${plaintext}`, "utf8").toString("base64"),
  decrypt: async (ciphertext) => {
    const plaintext = Buffer.from(ciphertext, "base64").toString("utf8");
    if (!plaintext.startsWith("sealed:")) {
      throw new Error("invalid ciphertext");
    }
    return plaintext.slice("sealed:".length);
  },
};

test("access tokens remain memory-only while refresh material is encrypted", async () => {
  const persistence = createMemoryPersistence();
  const store = createAuthTokenStore(persistence, crypto);

  await store.save({
    accessToken: "qat_access-secret",
    refreshToken: "qrt_refresh-secret",
    offlineLease: "signed-offline-lease",
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });

  const rawValue = persistence.readRaw() ?? "";
  assert.equal(rawValue.includes("qat_access-secret"), false);
  assert.equal(rawValue.includes("qrt_refresh-secret"), false);
  assert.equal(store.getAccessToken(), "qat_access-secret");
  assert.deepEqual(await store.restore(), {
    refreshToken: "qrt_refresh-secret",
    offlineLease: "signed-offline-lease",
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });
});

test("clearing auth material removes memory and disk state", async () => {
  const persistence = createMemoryPersistence();
  const store = createAuthTokenStore(persistence, crypto);
  await store.save({
    accessToken: "qat_access-secret",
    refreshToken: "qrt_refresh-secret",
    offlineLease: "signed-offline-lease",
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
  });

  await store.clear();

  assert.equal(store.getAccessToken(), null);
  assert.equal(await store.restore(), null);
  assert.equal(persistence.readRaw(), null);
});

test("malformed or undecryptable persisted material is discarded", async () => {
  const persistence = createMemoryPersistence();
  await persistence.write("not-an-encrypted-auth-record");
  const store = createAuthTokenStore(persistence, crypto);

  assert.equal(await store.restore(), null);
  assert.equal(persistence.readRaw(), null);
});
