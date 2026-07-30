import { createHmac, randomBytes, randomInt } from "node:crypto";

export function generateOpaqueToken(prefix: "qat" | "qrt"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function digestOpaqueToken(token: string, pepper: string): Buffer {
  if (Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error("token pepper must contain at least 32 bytes");
  }
  return createHmac("sha256", pepper).update(token, "utf8").digest();
}

export function generateEmailCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function digestEmailCode(
  email: string,
  purpose: "REGISTRATION" | "PASSWORD_RESET",
  code: string,
  pepper: string,
): Buffer {
  if (Buffer.byteLength(pepper, "utf8") < 32) {
    throw new Error("email code pepper must contain at least 32 bytes");
  }
  return createHmac("sha256", pepper)
    .update(`${email}\n${purpose}\n${code}`, "utf8")
    .digest();
}
