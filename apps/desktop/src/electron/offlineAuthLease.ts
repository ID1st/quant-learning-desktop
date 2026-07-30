import { verify } from "node:crypto";

import type {
  AuthSessionSnapshot,
  EntitlementDurationDays,
} from "../../../../packages/shared/src/auth.ts";
import { ENTITLEMENT_DURATION_DAYS } from "../../../../packages/shared/src/auth.ts";

interface OfflineLeaseClaims {
  userId: string;
  email: string;
  deviceId: string;
  entitlementDurationDays: EntitlementDurationDays;
  entitlementEndsAt: string;
  offlineUntil: string;
  issuedAt: string;
}

interface RestoreOfflineSessionInput {
  lease: string;
  publicKeyPem: string;
  deviceId: string;
  lastServerTime: string;
  now: Date;
}

const CLOCK_ROLLBACK_TOLERANCE_MILLISECONDS = 5 * 60 * 1_000;

function decodeClaims(encodedPayload: string): OfflineLeaseClaims {
  let value: unknown;
  try {
    value = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new Error("offline lease is invalid");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("offline lease is invalid");
  }
  const claims = value as Record<string, unknown>;
  if (
    typeof claims.userId !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.deviceId !== "string" ||
    !ENTITLEMENT_DURATION_DAYS.some(
      (duration) => duration === claims.entitlementDurationDays,
    ) ||
    typeof claims.entitlementEndsAt !== "string" ||
    !Number.isFinite(Date.parse(claims.entitlementEndsAt)) ||
    typeof claims.offlineUntil !== "string" ||
    !Number.isFinite(Date.parse(claims.offlineUntil)) ||
    typeof claims.issuedAt !== "string" ||
    !Number.isFinite(Date.parse(claims.issuedAt))
  ) {
    throw new Error("offline lease is invalid");
  }

  return claims as unknown as OfflineLeaseClaims;
}

export function restoreOfflineSession(
  input: RestoreOfflineSessionInput,
): AuthSessionSnapshot {
  const [encodedPayload, encodedSignature, unexpectedPart] =
    input.lease.split(".");
  if (!encodedPayload || !encodedSignature || unexpectedPart !== undefined) {
    throw new Error("offline lease is invalid");
  }
  const signatureValid = verify(
    null,
    Buffer.from(encodedPayload, "ascii"),
    input.publicKeyPem,
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!signatureValid) {
    throw new Error("offline lease is invalid");
  }

  const claims = decodeClaims(encodedPayload);
  if (claims.deviceId !== input.deviceId) {
    throw new Error("offline lease does not belong to this device");
  }

  const lastServerTime = Date.parse(input.lastServerTime);
  if (
    !Number.isFinite(lastServerTime) ||
    input.now.getTime() + CLOCK_ROLLBACK_TOLERANCE_MILLISECONDS <
      lastServerTime
  ) {
    throw new Error("system clock rollback requires online validation");
  }

  const offlineUntil = Date.parse(claims.offlineUntil);
  const entitlementEndsAt = Date.parse(claims.entitlementEndsAt);
  if (offlineUntil > entitlementEndsAt) {
    throw new Error("offline lease exceeds the entitlement");
  }
  if (
    input.now.getTime() > offlineUntil ||
    input.now.getTime() > entitlementEndsAt
  ) {
    throw new Error("offline lease has expired");
  }

  return {
    userId: claims.userId,
    email: claims.email,
    accessStatus: "ACTIVE",
    entitlementDurationDays: claims.entitlementDurationDays,
    entitlementEndsAt: claims.entitlementEndsAt,
    offlineUntil: claims.offlineUntil,
    deviceId: claims.deviceId,
    activeDeviceCount: 1,
    lastValidatedAt: claims.issuedAt,
    isOffline: true,
  };
}
