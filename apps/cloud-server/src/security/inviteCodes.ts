import { createHmac, randomInt } from "node:crypto";

import {
  formatInviteCode,
  normalizeInviteCode,
} from "../../../../packages/shared/src/inviteCodes.ts";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export { formatInviteCode, normalizeInviteCode };

function randomSymbols(length: number): string {
  return Array.from({ length }, () => INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)]).join(
    "",
  );
}

export function generateInviteCode(): string {
  const symbols = randomSymbols(15);
  return `QLD-${symbols.slice(0, 5)}-${symbols.slice(5, 10)}-${symbols.slice(10)}`;
}

export function digestInviteCode(normalizedCode: string, pepper: string): Buffer {
  if (!pepper) {
    throw new Error("invite code pepper is required");
  }

  return createHmac("sha256", pepper).update(normalizedCode, "ascii").digest();
}
