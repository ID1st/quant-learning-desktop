import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createLoginChallenge,
  createOfflineLease,
  validateOfflineLeaseKeyPair,
  verifyLoginChallenge,
  verifyOfflineLease,
} from "../src/security/signedArtifacts.ts";

test("login challenges are short-lived and reject tampering", () => {
  const secret = "challenge-secret-at-least-thirty-two-bytes";
  const token = createLoginChallenge(
    {
      userId: "user-1",
      email: "learner@example.com",
      authVersion: 0,
      reason: "INVITE_REQUIRED",
    },
    secret,
    new Date("2026-07-28T00:00:00.000Z"),
  );

  assert.deepEqual(verifyLoginChallenge(token, secret, new Date("2026-07-28T00:09:59.000Z")), {
    userId: "user-1",
    email: "learner@example.com",
    authVersion: 0,
    reason: "INVITE_REQUIRED",
    expiresAt: "2026-07-28T00:10:00.000Z",
  });
  assert.throws(
    () =>
      verifyLoginChallenge(`${token.slice(0, -1)}x`, secret, new Date("2026-07-28T00:01:00.000Z")),
    /invalid/i,
  );
  assert.throws(
    () => verifyLoginChallenge(token, secret, new Date("2026-07-28T00:10:01.000Z")),
    /expired/i,
  );
});

test("offline leases are verifiable with only the public key", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  }) as string;
  const publicKeyPem = publicKey.export({
    format: "pem",
    type: "spki",
  }) as string;
  const lease = createOfflineLease(
    {
      userId: "user-1",
      email: "learner@example.com",
      deviceId: "device-123",
      entitlementDurationDays: 30,
      entitlementEndsAt: "2026-08-27T00:00:00.000Z",
      offlineUntil: "2026-07-29T00:00:00.000Z",
      issuedAt: "2026-07-28T00:00:00.000Z",
    },
    privateKeyPem,
  );

  assert.deepEqual(verifyOfflineLease(lease, publicKeyPem, new Date("2026-07-28T12:00:00.000Z")), {
    userId: "user-1",
    email: "learner@example.com",
    deviceId: "device-123",
    entitlementDurationDays: 30,
    entitlementEndsAt: "2026-08-27T00:00:00.000Z",
    offlineUntil: "2026-07-29T00:00:00.000Z",
    issuedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.throws(
    () => verifyOfflineLease(lease, publicKeyPem, new Date("2026-07-29T00:00:00.001Z")),
    /expired/i,
  );
});

test("offline lease key validation accepts only a matching Ed25519 pair", () => {
  const firstPair = generateKeyPairSync("ed25519");
  const secondPair = generateKeyPairSync("ed25519");
  const privateKeyPem = firstPair.privateKey.export({
    format: "pem",
    type: "pkcs8",
  }) as string;
  const publicKeyPem = firstPair.publicKey.export({
    format: "pem",
    type: "spki",
  }) as string;
  const mismatchedPublicKeyPem = secondPair.publicKey.export({
    format: "pem",
    type: "spki",
  }) as string;

  assert.doesNotThrow(() => validateOfflineLeaseKeyPair(privateKeyPem, publicKeyPem));
  assert.throws(
    () => validateOfflineLeaseKeyPair("not-a-private-key", publicKeyPem),
    /private key/i,
  );
  assert.throws(
    () => validateOfflineLeaseKeyPair(privateKeyPem, mismatchedPublicKeyPem),
    /do not match/i,
  );
});

test("offline lease key validation rejects non-Ed25519 keys", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  }) as string;
  const publicKeyPem = publicKey.export({
    format: "pem",
    type: "spki",
  }) as string;

  assert.throws(() => validateOfflineLeaseKeyPair(privateKeyPem, publicKeyPem), /Ed25519/i);
});
