import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";

import { ENTITLEMENT_DURATION_DAYS, type EntitlementDurationDays } from "../domain/authDomain.ts";

export type LoginChallengeReason = "INVITE_REQUIRED" | "ENTITLEMENT_EXPIRED";

export interface LoginChallengeClaims {
  userId: string;
  email: string;
  authVersion: number;
  reason: LoginChallengeReason;
  expiresAt: string;
}

export interface OfflineLeaseClaims {
  userId: string;
  email: string;
  deviceId: string;
  entitlementDurationDays: EntitlementDurationDays;
  entitlementEndsAt: string;
  offlineUntil: string;
  issuedAt: string;
}

type LoginChallengeInput = Omit<LoginChallengeClaims, "expiresAt">;

const LOGIN_CHALLENGE_LIFETIME_MILLISECONDS = 10 * 60 * 1_000;
const OFFLINE_LEASE_KEY_VALIDATION_PAYLOAD = Buffer.from(
  "quant-auth-offline-lease-key-validation-v1",
  "ascii",
);

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(encodedValue: string): unknown {
  try {
    return JSON.parse(Buffer.from(encodedValue, "base64url").toString("utf8"));
  } catch {
    throw new Error("signed artifact payload is invalid");
  }
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("signed artifact payload is invalid");
  }
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function createLoginChallenge(
  input: LoginChallengeInput,
  secret: string,
  now: Date,
): string {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("login challenge secret must contain at least 32 bytes");
  }

  const payload = encodeJson({
    ...input,
    expiresAt: new Date(now.getTime() + LOGIN_CHALLENGE_LIFETIME_MILLISECONDS).toISOString(),
  });
  const signature = createHmac("sha256", secret).update(payload, "ascii").digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyLoginChallenge(
  token: string,
  secret: string,
  now: Date,
): LoginChallengeClaims {
  const [payload, encodedSignature, unexpectedPart] = token.split(".");
  if (!payload || !encodedSignature || unexpectedPart !== undefined) {
    throw new Error("login challenge is invalid");
  }

  const observedSignature = Buffer.from(encodedSignature, "base64url");
  const expectedSignature = createHmac("sha256", secret).update(payload, "ascii").digest();
  if (
    observedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(observedSignature, expectedSignature)
  ) {
    throw new Error("login challenge is invalid");
  }

  const claims = decodeJson(payload);
  assertRecord(claims);
  if (
    typeof claims.userId !== "string" ||
    typeof claims.email !== "string" ||
    !Number.isInteger(claims.authVersion) ||
    Number(claims.authVersion) < 0 ||
    (claims.reason !== "INVITE_REQUIRED" && claims.reason !== "ENTITLEMENT_EXPIRED") ||
    !isValidDate(claims.expiresAt)
  ) {
    throw new Error("login challenge is invalid");
  }
  if (Date.parse(claims.expiresAt) < now.getTime()) {
    throw new Error("login challenge has expired");
  }

  return {
    userId: claims.userId,
    email: claims.email,
    authVersion: Number(claims.authVersion),
    reason: claims.reason,
    expiresAt: claims.expiresAt,
  };
}

export function createOfflineLease(claims: OfflineLeaseClaims, privateKeyPem: string): string {
  const payload = encodeJson(claims);
  const signature = sign(null, Buffer.from(payload, "ascii"), privateKeyPem).toString("base64url");

  return `${payload}.${signature}`;
}

export function validateOfflineLeaseKeyPair(privateKeyPem: string, publicKeyPem: string): void {
  let privateKey;
  try {
    privateKey = createPrivateKey(privateKeyPem);
  } catch {
    throw new Error("offline lease private key is invalid");
  }

  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new Error("offline lease public key is invalid");
  }

  if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("offline lease keys must use Ed25519");
  }

  const signature = sign(null, OFFLINE_LEASE_KEY_VALIDATION_PAYLOAD, privateKey);
  if (!verify(null, OFFLINE_LEASE_KEY_VALIDATION_PAYLOAD, publicKey, signature)) {
    throw new Error("offline lease private and public keys do not match");
  }
}

export function verifyOfflineLease(
  lease: string,
  publicKeyPem: string,
  now: Date,
): OfflineLeaseClaims {
  const [payload, encodedSignature, unexpectedPart] = lease.split(".");
  if (!payload || !encodedSignature || unexpectedPart !== undefined) {
    throw new Error("offline lease is invalid");
  }

  const signature = Buffer.from(encodedSignature, "base64url");
  if (!verify(null, Buffer.from(payload, "ascii"), publicKeyPem, signature)) {
    throw new Error("offline lease is invalid");
  }

  const claims = decodeJson(payload);
  assertRecord(claims);
  if (
    typeof claims.userId !== "string" ||
    typeof claims.email !== "string" ||
    typeof claims.deviceId !== "string" ||
    !ENTITLEMENT_DURATION_DAYS.some((duration) => duration === claims.entitlementDurationDays) ||
    !isValidDate(claims.entitlementEndsAt) ||
    !isValidDate(claims.offlineUntil) ||
    !isValidDate(claims.issuedAt)
  ) {
    throw new Error("offline lease is invalid");
  }

  const entitlementEndsAt = Date.parse(claims.entitlementEndsAt);
  const offlineUntil = Date.parse(claims.offlineUntil);
  if (offlineUntil > entitlementEndsAt) {
    throw new Error("offline lease exceeds the entitlement");
  }
  if (Math.min(offlineUntil, entitlementEndsAt) < now.getTime()) {
    throw new Error("offline lease has expired");
  }

  return {
    userId: claims.userId,
    email: claims.email,
    deviceId: claims.deviceId,
    entitlementDurationDays: claims.entitlementDurationDays as EntitlementDurationDays,
    entitlementEndsAt: claims.entitlementEndsAt,
    offlineUntil: claims.offlineUntil,
    issuedAt: claims.issuedAt,
  };
}
