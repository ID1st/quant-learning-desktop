import assert from "node:assert/strict";
import test from "node:test";

import {
  digestInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "../src/security/inviteCodes.ts";

test("generated invite codes are unique, human-readable and normalize to 18 symbols", () => {
  const codes = new Set(
    Array.from({ length: 500 }, () => generateInviteCode()),
  );

  assert.equal(codes.size, 500);
  for (const code of codes) {
    assert.match(code, /^QLD-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    assert.equal(normalizeInviteCode(` ${code.toLowerCase()} `).length, 18);
  }
});

test("normalization ignores separators but rejects unexpected characters", () => {
  assert.equal(
    normalizeInviteCode(" qld-abcd2 efgh3-ijkm4 "),
    "QLDABCD2EFGH3IJKM4",
  );
  assert.throws(() => normalizeInviteCode("QLD-ABCD2-💥-EFGH3"), /format/i);
  assert.throws(() => normalizeInviteCode("QUANT2026"), /format/i);
});

test("invite digests are deterministic, keyed and never contain plaintext", () => {
  const normalizedCode = "QLDABCD2EFGH3IJKM4";
  const first = digestInviteCode(normalizedCode, "pepper-one");
  const second = digestInviteCode(normalizedCode, "pepper-one");
  const differentPepper = digestInviteCode(normalizedCode, "pepper-two");

  assert.equal(first.equals(second), true);
  assert.equal(first.equals(differentPepper), false);
  assert.equal(first.length, 32);
  assert.equal(first.includes(Buffer.from(normalizedCode)), false);
});
