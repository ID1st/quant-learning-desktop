type UnknownRecord = Record<string, unknown>;

function assertRecord(value: unknown, label: string): asserts value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: UnknownRecord,
  expectedKeys: readonly string[],
): void {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError("authentication IPC input keys are invalid");
  }
}

function assertEmail(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 3 ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new TypeError("email is invalid");
  }
}

function assertPassword(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 64 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new TypeError("password is invalid");
  }
}

function assertEmailCode(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
    throw new TypeError("email code is invalid");
  }
}

export function assertEmailInput(
  value: unknown,
): asserts value is { email: string } {
  assertRecord(value, "email input");
  assertExactKeys(value, ["email"]);
  assertEmail(value.email);
}

export function assertLoginInput(
  value: unknown,
): asserts value is { email: string; password: string } {
  assertRecord(value, "login input");
  assertExactKeys(value, ["email", "password"]);
  assertEmail(value.email);
  assertPassword(value.password);
}

export function assertRegisterInput(
  value: unknown,
): asserts value is {
  email: string;
  emailCode: string;
  password: string;
} {
  assertRecord(value, "registration input");
  assertExactKeys(value, ["email", "emailCode", "password"]);
  assertEmail(value.email);
  assertEmailCode(value.emailCode);
  assertPassword(value.password);
}

export function assertResetPasswordInput(
  value: unknown,
): asserts value is {
  email: string;
  emailCode: string;
  password: string;
} {
  assertRegisterInput(value);
}

export function assertInviteInput(
  value: unknown,
): asserts value is { inviteCode: string } {
  assertRecord(value, "invite input");
  assertExactKeys(value, ["inviteCode"]);
  if (
    typeof value.inviteCode !== "string" ||
    value.inviteCode.length < 18 ||
    value.inviteCode.length > 64 ||
    !/^[A-Za-z0-9\s-]+$/.test(value.inviteCode)
  ) {
    throw new TypeError("invite code is invalid");
  }
}
