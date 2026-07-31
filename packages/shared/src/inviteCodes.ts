const NORMALIZED_INVITE_PATTERN = /^QLD[A-Z2-9]{15}$/;
const INVITE_SEPARATOR_PATTERN = /[\s\-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]+/gu;

export function normalizeInviteCode(rawCode: string): string {
  const normalized = rawCode.normalize("NFKC").toUpperCase().replace(INVITE_SEPARATOR_PATTERN, "");
  if (!NORMALIZED_INVITE_PATTERN.test(normalized)) {
    throw new Error("invite code format is invalid");
  }
  return normalized;
}

export function formatInviteCode(rawCode: string): string {
  const normalized = normalizeInviteCode(rawCode);
  return `QLD-${normalized.slice(3, 8)}-${normalized.slice(8, 13)}-${normalized.slice(13)}`;
}
