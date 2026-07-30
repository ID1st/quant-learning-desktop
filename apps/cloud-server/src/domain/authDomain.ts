export const ENTITLEMENT_DURATION_DAYS = [7, 30, 90, 365] as const;

export type EntitlementDurationDays = (typeof ENTITLEMENT_DURATION_DAYS)[number];

export type PasswordPolicyFailure =
  "LENGTH" | "ASCII_NO_WHITESPACE" | "LOWERCASE" | "UPPERCASE" | "DIGIT" | "SPECIAL";

export interface PasswordPolicyResult {
  valid: boolean;
  failures: PasswordPolicyFailure[];
}

export interface InviteBatchEntry {
  durationDays: EntitlementDurationDays;
  count: number;
}

export interface InviteBatchArguments {
  claimDays: number;
  entries: InviteBatchEntry[];
  totalCount: number;
}

export interface EntitlementPeriodInput {
  now: Date;
  currentEndsAt: Date | null;
  durationDays: EntitlementDurationDays;
}

export interface EntitlementPeriod {
  startsAt: Date;
  endsAt: Date;
}

const MAX_INVITE_BATCH_SIZE = 500;
const MIN_CLAIM_DAYS = 1;
const MAX_CLAIM_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const failures: PasswordPolicyFailure[] = [];

  if (password.length < 8 || password.length > 64) {
    failures.push("LENGTH");
  }
  if (!/^[\x21-\x7e]+$/.test(password)) {
    failures.push("ASCII_NO_WHITESPACE");
  }
  if (!/[a-z]/.test(password)) {
    failures.push("LOWERCASE");
  }
  if (!/[A-Z]/.test(password)) {
    failures.push("UPPERCASE");
  }
  if (!/[0-9]/.test(password)) {
    failures.push("DIGIT");
  }
  if (!/[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password)) {
    failures.push("SPECIAL");
  }

  return {
    valid: failures.length === 0,
    failures,
  };
}

export function calculateEntitlementPeriod(input: EntitlementPeriodInput): EntitlementPeriod {
  const currentEndsAt =
    input.currentEndsAt && input.currentEndsAt.getTime() > input.now.getTime()
      ? input.currentEndsAt
      : input.now;
  const startsAt = new Date(currentEndsAt.getTime());
  const endsAt = new Date(startsAt.getTime() + input.durationDays * MILLISECONDS_PER_DAY);

  return { startsAt, endsAt };
}

function isEntitlementDurationDays(value: number): value is EntitlementDurationDays {
  return ENTITLEMENT_DURATION_DAYS.some((duration) => duration === value);
}

function parsePositiveInteger(rawValue: string | undefined, label: string): number {
  if (!rawValue || !/^[1-9]\d*$/.test(rawValue)) {
    throw new Error(`${label} must be a positive integer`);
  }

  return Number(rawValue);
}

function readOption(argumentsList: string[], optionName: string): string | undefined {
  const index = argumentsList.indexOf(optionName);
  if (index < 0) {
    return undefined;
  }

  return argumentsList[index + 1];
}

function parseDuration(rawDuration: string | undefined): EntitlementDurationDays {
  const durationDays = parsePositiveInteger(rawDuration, "duration");
  if (!isEntitlementDurationDays(durationDays)) {
    throw new Error("duration must be one of 7, 30, 90 or 365 days");
  }

  return durationDays;
}

function parseSpecification(rawSpecification: string): InviteBatchEntry[] {
  if (!rawSpecification.trim()) {
    throw new Error("invite batch specification cannot be empty");
  }

  return rawSpecification.split(",").map((pair) => {
    const [durationValue, countValue, unexpected] = pair.split("=");
    if (unexpected !== undefined) {
      throw new Error(`invalid invite batch entry: ${pair}`);
    }

    return {
      durationDays: parseDuration(durationValue?.trim()),
      count: parsePositiveInteger(countValue?.trim(), "count"),
    };
  });
}

export function parseInviteBatchArguments(argumentsList: string[]): InviteBatchArguments {
  const rawSpecification = readOption(argumentsList, "--spec");
  const rawDuration = readOption(argumentsList, "--duration-days");
  const rawCount = readOption(argumentsList, "--count");

  if (rawSpecification && (rawDuration || rawCount)) {
    throw new Error("use either --spec or --duration-days with --count");
  }

  const entries = rawSpecification
    ? parseSpecification(rawSpecification)
    : [
        {
          durationDays: parseDuration(rawDuration),
          count: parsePositiveInteger(rawCount, "count"),
        },
      ];

  const claimDays = readOption(argumentsList, "--claim-days")
    ? parsePositiveInteger(readOption(argumentsList, "--claim-days"), "claim days")
    : 30;
  if (claimDays < MIN_CLAIM_DAYS || claimDays > MAX_CLAIM_DAYS) {
    throw new Error("claim days must be between 1 and 90");
  }

  const totalCount = entries.reduce((total, entry) => total + entry.count, 0);
  if (totalCount > MAX_INVITE_BATCH_SIZE) {
    throw new Error("invite batches cannot contain more than 500 codes");
  }

  return { claimDays, entries, totalCount };
}
