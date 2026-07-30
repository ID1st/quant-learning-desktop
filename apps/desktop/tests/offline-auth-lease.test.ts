import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createOfflineLease } from "../../cloud-server/src/security/signedArtifacts.ts";
import { restoreOfflineSession } from "../src/electron/offlineAuthLease.ts";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;
const publicKeyPem = publicKey.export({
  format: "pem",
  type: "spki",
}) as string;

function createLease() {
  return createOfflineLease(
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
  );
}

test("a valid signed lease restores only a non-sensitive offline snapshot", () => {
  const snapshot = restoreOfflineSession({
    lease: createLease(),
    publicKeyPem,
    deviceId: "device-1234",
    lastServerTime: "2026-07-28T00:00:00.000Z",
    now: new Date("2026-07-28T12:00:00.000Z"),
  });

  assert.deepEqual(snapshot, {
    userId: "user-1",
    email: "learner@example.com",
    accessStatus: "ACTIVE",
    entitlementDurationDays: 30,
    entitlementEndsAt: "2026-08-27T00:00:00.000Z",
    offlineUntil: "2026-07-29T00:00:00.000Z",
    deviceId: "device-1234",
    activeDeviceCount: 1,
    lastValidatedAt: "2026-07-28T00:00:00.000Z",
    isOffline: true,
  });
  assert.equal(JSON.stringify(snapshot).includes("Token"), false);
});

test("offline restoration rejects device mismatch, expiry and clock rollback", () => {
  const lease = createLease();
  assert.throws(
    () =>
      restoreOfflineSession({
        lease,
        publicKeyPem,
        deviceId: "device-other",
        lastServerTime: "2026-07-28T00:00:00.000Z",
        now: new Date("2026-07-28T12:00:00.000Z"),
      }),
    /device/i,
  );
  assert.throws(
    () =>
      restoreOfflineSession({
        lease,
        publicKeyPem,
        deviceId: "device-1234",
        lastServerTime: "2026-07-28T00:00:00.000Z",
        now: new Date("2026-07-29T00:00:00.001Z"),
      }),
    /expired/i,
  );
  assert.throws(
    () =>
      restoreOfflineSession({
        lease,
        publicKeyPem,
        deviceId: "device-1234",
        lastServerTime: "2026-07-28T12:00:00.000Z",
        now: new Date("2026-07-28T10:00:00.000Z"),
      }),
    /clock/i,
  );
});
