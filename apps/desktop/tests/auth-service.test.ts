import assert from "node:assert/strict";
import test from "node:test";

import {
  authErrorMessage,
  normalizeInviteInput,
  renewalCredentialsRequired,
} from "../src/features/auth/authService.ts";

test("duplicate registration gives returning users a clear next step", () => {
  assert.equal(
    authErrorMessage("ACCOUNT_ALREADY_EXISTS"),
    "该邮箱已注册，请直接登录；如忘记密码，请重置密码。",
  );
});

test("desktop invite normalization uses the canonical grouped representation", () => {
  assert.equal(
    normalizeInviteInput("\r\nＱＬＤ－ＡＢＣＤ２‐ＥＦＧＨ３—ＩＪＫＭ４\t"),
    "QLD-ABCD2-EFGH3-IJKM4",
  );
});

test("renewal requires credentials when the email is missing or differs from the verified login", () => {
  assert.equal(renewalCredentialsRequired("learner@example.com", " LEARNER@example.com "), false);
  assert.equal(renewalCredentialsRequired("learner@example.com", "other@example.com"), true);
  assert.equal(renewalCredentialsRequired("", "learner@example.com"), true);
});
