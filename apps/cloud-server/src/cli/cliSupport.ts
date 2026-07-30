export function assertRootInviteExportAccess(): void {
  if (
    process.platform !== "win32" &&
    typeof process.getuid === "function" &&
    process.getuid() !== 0
  ) {
    throw new Error("invite export commands must run as root");
  }
}

export function readRequiredOption(
  argumentsList: string[],
  optionName: string,
): string {
  const index = argumentsList.indexOf(optionName);
  const value = index >= 0 ? argumentsList[index + 1]?.trim() : "";
  if (!value) {
    throw new Error(`${optionName} is required`);
  }
  return value;
}

export function assertUuid(value: string, label: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new Error(`${label} must be a valid UUID`);
  }
}
