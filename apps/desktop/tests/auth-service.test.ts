import assert from "node:assert/strict";
import test from "node:test";

import { authErrorMessage } from "../src/features/auth/authService.ts";

test("duplicate registration gives returning users a clear next step", () => {
  assert.equal(
    authErrorMessage("ACCOUNT_ALREADY_EXISTS"),
    "该邮箱已注册，请直接登录；如忘记密码，请重置密码。",
  );
});
