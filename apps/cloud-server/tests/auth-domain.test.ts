import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateEntitlementPeriod,
  parseInviteBatchArguments,
  validatePasswordPolicy,
} from "../src/domain/authDomain.ts";

test("password policy accepts only strong 8-64 character ASCII passwords", () => {
  assert.deepEqual(validatePasswordPolicy("Quant#2026"), {
    valid: true,
    failures: [],
  });

  assert.deepEqual(validatePasswordPolicy("weak password"), {
    valid: false,
    failures: ["ASCII_NO_WHITESPACE", "UPPERCASE", "DIGIT", "SPECIAL"],
  });

  assert.equal(validatePasswordPolicy("Aa1!密码密码").valid, false);
  assert.equal(validatePasswordPolicy(`${"Aa1!".repeat(17)}`).valid, false);
});

test("entitlement starts now for first redemption", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");
  const period = calculateEntitlementPeriod({
    now,
    currentEndsAt: null,
    durationDays: 7,
  });

  assert.equal(period.startsAt.toISOString(), "2026-07-28T00:00:00.000Z");
  assert.equal(period.endsAt.toISOString(), "2026-08-04T00:00:00.000Z");
});

test("active entitlement renewals extend from the existing end time", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");
  const period = calculateEntitlementPeriod({
    now,
    currentEndsAt: new Date("2026-08-27T00:00:00.000Z"),
    durationDays: 30,
  });

  assert.equal(period.startsAt.toISOString(), "2026-08-27T00:00:00.000Z");
  assert.equal(period.endsAt.toISOString(), "2026-09-26T00:00:00.000Z");
});

test("expired entitlement renewals restart from redemption time", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");
  const period = calculateEntitlementPeriod({
    now,
    currentEndsAt: new Date("2026-07-20T00:00:00.000Z"),
    durationDays: 90,
  });

  assert.equal(period.startsAt.toISOString(), "2026-07-28T00:00:00.000Z");
  assert.equal(period.endsAt.toISOString(), "2026-10-26T00:00:00.000Z");
});

test("batch arguments support one duration and mixed specifications", () => {
  assert.deepEqual(
    parseInviteBatchArguments(["--duration-days", "30", "--count", "100", "--claim-days", "30"]),
    {
      claimDays: 30,
      entries: [{ durationDays: 30, count: 100 }],
      totalCount: 100,
    },
  );

  assert.deepEqual(
    parseInviteBatchArguments(["--spec", "7=20,30=50,90=20,365=10", "--claim-days", "45"]),
    {
      claimDays: 45,
      entries: [
        { durationDays: 7, count: 20 },
        { durationDays: 30, count: 50 },
        { durationDays: 90, count: 20 },
        { durationDays: 365, count: 10 },
      ],
      totalCount: 100,
    },
  );
});

test("batch arguments reject unsupported durations, invalid claim windows and totals above 500", () => {
  assert.throws(
    () => parseInviteBatchArguments(["--duration-days", "14", "--count", "1"]),
    /duration/i,
  );
  assert.throws(
    () =>
      parseInviteBatchArguments(["--duration-days", "30", "--count", "1", "--claim-days", "91"]),
    /claim/i,
  );
  assert.throws(() => parseInviteBatchArguments(["--spec", "7=100,30=200,90=100,365=101"]), /500/);
});
