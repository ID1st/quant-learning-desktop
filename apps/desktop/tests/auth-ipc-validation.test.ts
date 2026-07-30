import assert from "node:assert/strict";
import test from "node:test";

import {
  assertEmailInput,
  assertInviteInput,
  assertLoginInput,
  assertRegisterInput,
  assertResetPasswordInput,
} from "../src/electron/authIpcValidation.ts";

test("authentication IPC accepts bounded exact-shape inputs", () => {
  assert.doesNotThrow(() =>
    assertLoginInput({
      email: "learner@example.com",
      password: "Quant#2026",
    }),
  );
  assert.doesNotThrow(() =>
    assertRegisterInput({
      email: "learner@example.com",
      emailCode: "123456",
      password: "Quant#2026",
    }),
  );
  assert.doesNotThrow(() =>
    assertResetPasswordInput({
      email: "learner@example.com",
      emailCode: "123456",
      password: "Reset#2026",
    }),
  );
  assert.doesNotThrow(() =>
    assertInviteInput({ inviteCode: "QLD-ABCDE-FGHJK-MNPQR" }),
  );
  assert.doesNotThrow(() =>
    assertEmailInput({ email: "learner@example.com" }),
  );
});

test("authentication IPC rejects extra keys, wrong types and oversized secrets", () => {
  assert.throws(
    () =>
      assertLoginInput({
        email: "learner@example.com",
        password: "Quant#2026",
        accessToken: "renderer-must-not-send-tokens",
      }),
    /keys/i,
  );
  assert.throws(
    () => assertLoginInput({ email: "learner@example.com", password: 123 }),
    /password/i,
  );
  assert.throws(
    () =>
      assertRegisterInput({
        email: "learner@example.com",
        emailCode: "123456",
        password: "A".repeat(65),
      }),
    /password/i,
  );
  assert.throws(
    () => assertInviteInput({ inviteCode: "QLD-ABCDE-💥-MNPQR" }),
    /invite/i,
  );
});
