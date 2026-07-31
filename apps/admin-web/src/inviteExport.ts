export const DURATION_TIERS = [7, 30, 90, 365] as const;
export type DurationTier = (typeof DURATION_TIERS)[number];

export interface InviteCodeResult {
  inviteCode: string;
  durationDays: DurationTier;
  claimExpiresAt: string;
}

export type DurationCounts = Record<DurationTier, number>;

export function buildInviteEntries(counts: DurationCounts) {
  return DURATION_TIERS.flatMap((durationDays) => {
    const count = counts[durationDays];
    return count > 0 ? [{ durationDays, count }] : [];
  });
}

function escapeCsvCell(value: string): string {
  const needsFormulaProtection = /^[=+\-@]/.test(value);
  const protectedValue = needsFormulaProtection ? `'${value}` : value;
  return needsFormulaProtection || /[",\r\n]/.test(protectedValue)
    ? `"${protectedValue.replaceAll('"', '""')}"`
    : protectedValue;
}

export function buildInviteCsv(codes: InviteCodeResult[]): string {
  const rows = codes.map((code) =>
    [escapeCsvCell(code.inviteCode), code.durationDays, escapeCsvCell(code.claimExpiresAt)].join(
      ",",
    ),
  );
  return `\uFEFFinvite_code,duration_days,claim_expires_at\r\n${rows.join("\r\n")}\r\n`;
}
