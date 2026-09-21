import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncAuthCrypto } from "../src/electron/asyncAuthCrypto.ts";
import { createAuthTokenStore } from "../src/electron/authTokenStore.ts";

test("authentication uses native async encryption and never the synchronous Keychain API", async () => {
  const storage = {
    isEncryptionAvailable() {
      throw new Error("sync API used");
    },
    encryptString() {
      throw new Error("sync API used");
    },
    decryptString() {
      throw new Error("sync API used");
    },
    async isAsyncEncryptionAvailable() {
      return true;
    },
    async encryptStringAsync(value: string) {
      return Buffer.from(value);
    },
    async decryptStringAsync(value: Buffer) {
      return { result: value.toString() };
    },
  };
  const crypto = createAsyncAuthCrypto(storage);
  assert.equal(await crypto.isEncryptionAvailable(), true);
  assert.equal(await crypto.decrypt(await crypto.encrypt("legacy-material")), "legacy-material");
});

test("pending native async restore leaves the event loop responsive and discards only the expired session", async () => {
  let raw: string | null = JSON.stringify({ version: 1, encryptedPayload: "b2xk" });
  let heartbeat = false;
  const crypto = createAsyncAuthCrypto({
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async () => Buffer.from("encrypted"),
    decryptStringAsync: () => new Promise(() => undefined),
  });
  const store = createAuthTokenStore(
    {
      read: async () => raw,
      write: async (value) => {
        raw = value;
      },
      remove: async () => {
        raw = null;
      },
    },
    crypto,
    { restoreTimeoutMilliseconds: 20 },
  );
  setTimeout(() => {
    heartbeat = true;
  }, 0);
  assert.equal(await store.restore(), null);
  assert.equal(heartbeat, true);
  assert.equal(raw, null);
});

test("async availability rejection is awaited and never writes plaintext", async () => {
  let wrote = false;
  const store = createAuthTokenStore(
    {
      read: async () => null,
      write: async () => {
        wrote = true;
      },
      remove: async () => {},
    },
    {
      isEncryptionAvailable: async () => false,
      encrypt: async () => {
        throw new Error("must not encrypt");
      },
      decrypt: async () => "",
    },
  );
  await assert.rejects(
    store.save({
      accessToken: "a",
      refreshToken: "r",
      offlineLease: "l",
      deviceId: "d",
      lastServerTime: "t",
    }),
    /encryption is unavailable/,
  );
  assert.equal(wrote, false);
});
