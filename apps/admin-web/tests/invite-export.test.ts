import assert from "node:assert/strict";
import test from "node:test";

import { buildInviteCsv, buildInviteEntries, type InviteCodeResult } from "../src/inviteExport.ts";

test("mixed duration counts omit empty tiers and preserve supported order", () => {
  assert.deepEqual(
    buildInviteEntries({
      7: 2,
      30: 0,
      90: 1,
      365: 0,
    }),
    [
      { durationDays: 7, count: 2 },
      { durationDays: 90, count: 1 },
    ],
  );
});

test("CSV export includes a BOM, stable columns and protects spreadsheet cells", () => {
  const codes: InviteCodeResult[] = [
    {
      inviteCode: "QLD-AAAAA-BBBBB-CCCCC",
      durationDays: 7,
      claimExpiresAt: "2026-08-07T00:00:00.000Z",
    },
    {
      inviteCode: "=unsafe",
      durationDays: 30,
      claimExpiresAt: "2026-08-07T00:00:00.000Z",
    },
  ];

  const csv = buildInviteCsv(codes);

  assert.ok(csv.startsWith("\uFEFFinvite_code,duration_days,claim_expires_at\r\n"));
  assert.match(csv, /QLD-AAAAA-BBBBB-CCCCC,7,2026-08-07T00:00:00.000Z/);
  assert.match(csv, /"'=unsafe",30/);
});
