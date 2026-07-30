import { createHmac, randomInt } from "node:crypto";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NORMALIZED_INVITE_PATTERN = /^QLD[A-Z2-9]{15}$/;

function randomSymbols(length: number): string {
  return Array.from(
    { length },
    () => INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)],
  ).join("");
}

export function generateInviteCode(): string {
  const symbols = randomSymbols(15);
  return `QLD-${symbols.slice(0, 5)}-${symbols.slice(5, 10)}-${symbols.slice(10)}`;
}

export function normalizeInviteCode(rawCode: string): string {
  const normalized = rawCode.toUpperCase().replace(/[\s-]+/g, "");
  if (!NORMALIZED_INVITE_PATTERN.test(normalized)) {
    throw new Error("invite code format is invalid");
  }

  return normalized;
}

export function digestInviteCode(
  normalizedCode: string,
  pepper: string,
): Buffer {
  if (!pepper) {
    throw new Error("invite code pepper is required");
  }

  return createHmac("sha256", pepper).update(normalizedCode, "ascii").digest();
}
