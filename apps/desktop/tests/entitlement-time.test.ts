import assert from "node:assert/strict";
import test from "node:test";

import { formatEntitlementRemaining } from "../src/features/auth/entitlementTime.ts";

test("formats entitlement time with the two largest useful units", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  assert.equal(
    formatEntitlementRemaining("2026-08-01T14:30:00.000Z", now),
    "2 天 2 小时",
  );
  assert.equal(
    formatEntitlementRemaining("2026-07-30T12:45:00.000Z", now),
    "45 分钟",
  );
});

test("handles near-expiry, expired, and invalid entitlement times", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  assert.equal(
    formatEntitlementRemaining("2026-07-30T12:00:30.000Z", now),
    "不足 1 分钟",
  );
  assert.equal(
    formatEntitlementRemaining("2026-07-30T11:59:59.000Z", now),
    "已到期",
  );
  assert.equal(formatEntitlementRemaining("not-a-date", now), "无法计算");
});
