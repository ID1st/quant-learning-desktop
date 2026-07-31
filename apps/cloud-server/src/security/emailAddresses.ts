export function normalizeEmailAddress(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("email address is invalid");
  }
  return email;
}
