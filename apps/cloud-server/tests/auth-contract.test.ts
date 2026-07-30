import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_ERROR_CODES,
  ENTITLEMENT_DURATION_DAYS,
  isAuthErrorCode,
  isAuthSessionSnapshot,
} from "../../../packages/shared/src/auth.ts";

test("the authentication contract exposes every renderer-safe error code", () => {
  assert.deepEqual(AUTH_ERROR_CODES, [
    "INVALID_CREDENTIALS",
    "EMAIL_CODE_INVALID",
    "EMAIL_CODE_EXPIRED",
    "ACCOUNT_ALREADY_EXISTS",
    "INVITE_INVALID",
    "INVITE_EXPIRED",
    "INVITE_ALREADY_REDEEMED",
    "ENTITLEMENT_EXPIRED",
    "SESSION_REVOKED",
    "DEVICE_LIMIT_REACHED",
    "PASSWORD_POLICY_FAILED",
    "RATE_LIMITED",
    "NETWORK_UNAVAILABLE",
    "SERVICE_UNAVAILABLE",
    "ACCESS_DENIED",
  ]);
  assert.equal(isAuthErrorCode("INVITE_INVALID"), true);
  assert.equal(isAuthErrorCode("database_timeout"), false);
});

test("the session snapshot validator rejects token-like and malformed data", () => {
  const validSnapshot = {
    userId: "4e857adb-acde-4d05-9c9d-1cb4cc519946",
    email: "learner@example.com",
    accessStatus: "ACTIVE",
    entitlementDurationDays: 30,
    entitlementEndsAt: "2026-08-27T00:00:00.000Z",
    offlineUntil: "2026-07-29T00:00:00.000Z",
    deviceId: "device-9a5a",
    activeDeviceCount: 1,
    lastValidatedAt: "2026-07-28T00:00:00.000Z",
    isOffline: false,
  };

  assert.equal(isAuthSessionSnapshot(validSnapshot), true);
  assert.equal(isAuthSessionSnapshot({ ...validSnapshot, accessToken: "must-not-leak" }), false);
  assert.equal(isAuthSessionSnapshot({ ...validSnapshot, entitlementDurationDays: 14 }), false);
  assert.equal(isAuthSessionSnapshot({ ...validSnapshot, activeDeviceCount: -1 }), false);
});

test("entitlement durations remain restricted to supported tiers", () => {
  assert.deepEqual(ENTITLEMENT_DURATION_DAYS, [7, 30, 90, 365]);
});
