export const ENTITLEMENT_DURATION_DAYS = [7, 30, 90, 365] as const;

export type EntitlementDurationDays =
  (typeof ENTITLEMENT_DURATION_DAYS)[number];

export const ACCESS_STATUSES = [
  "ACTIVE",
  "INVITE_REQUIRED",
  "ENTITLEMENT_EXPIRED",
  "DISABLED",
] as const;

export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const AUTH_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "EMAIL_CODE_INVALID",
  "EMAIL_CODE_EXPIRED",
  "ACCOUNT_ALREADY_EXISTS",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "INVITE_ALREADY_REDEEMED",
  "ENTITLEMENT_EXPIRED",
  "SESSION_REVOKED",
  "DEVICE_LIMIT_REACHED",
  "PASSWORD_POLICY_FAILED",
  "RATE_LIMITED",
  "NETWORK_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
  "ACCESS_DENIED",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_PHASES = [
  "BOOTSTRAPPING",
  "SIGNED_OUT",
  "REGISTERING",
  "LOGIN",
  "INVITE_REQUIRED",
  "ENTITLEMENT_EXPIRED",
  "RESET_REQUEST",
  "RESET_PASSWORD",
  "AUTHENTICATED_ONLINE",
  "AUTHENTICATED_OFFLINE",
  "SERVICE_UNAVAILABLE",
] as const;

export type AuthPhase = (typeof AUTH_PHASES)[number];

export interface AuthSessionSnapshot {
  userId: string;
  email: string;
  accessStatus: AccessStatus;
  entitlementDurationDays: EntitlementDurationDays;
  entitlementEndsAt: string;
  offlineUntil: string;
  deviceId: string;
  activeDeviceCount: number;
  lastValidatedAt: string;
  isOffline: boolean;
}

export type LoginResult =
  | { kind: "AUTHENTICATED"; session: AuthSessionSnapshot }
  | { kind: "INVITE_REQUIRED" }
  | { kind: "ENTITLEMENT_EXPIRED"; expiredAt: string }
  | { kind: "ACCESS_DENIED" };

export interface AuthOperationError {
  code: AuthErrorCode;
  message: string;
  retryAfterSeconds?: number;
}

export type AuthOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthOperationError };

export interface RequestRegistrationCodeInput {
  email: string;
}

export interface RegisterInput {
  email: string;
  emailCode: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RedeemInviteInput {
  inviteCode: string;
}

export interface RenewEntitlementInput {
  inviteCode: string;
}

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetPasswordInput {
  email: string;
  emailCode: string;
  password: string;
}

export interface EmailCodeRequestResult {
  accepted: true;
  retryAfterSeconds: number;
}

export interface RegistrationResult {
  email: string;
}

export interface PasswordResetResult {
  sessionsRevoked: true;
}

export interface AuthStateSnapshot {
  phase: AuthPhase;
  session: AuthSessionSnapshot | null;
  errorCode: AuthErrorCode | null;
}

export interface QuantDesktopAuthBridge {
  bootstrap(): Promise<AuthOperationResult<AuthStateSnapshot>>;
  requestRegistrationCode(
    input: RequestRegistrationCodeInput,
  ): Promise<AuthOperationResult<EmailCodeRequestResult>>;
  register(
    input: RegisterInput,
  ): Promise<AuthOperationResult<RegistrationResult>>;
  login(input: LoginInput): Promise<AuthOperationResult<LoginResult>>;
  redeemInvite(
    input: RedeemInviteInput,
  ): Promise<AuthOperationResult<AuthSessionSnapshot>>;
  renewEntitlement(
    input: RenewEntitlementInput,
  ): Promise<AuthOperationResult<AuthSessionSnapshot>>;
  requestPasswordReset(
    input: RequestPasswordResetInput,
  ): Promise<AuthOperationResult<EmailCodeRequestResult>>;
  resetPassword(
    input: ResetPasswordInput,
  ): Promise<AuthOperationResult<PasswordResetResult>>;
  logout(): Promise<AuthOperationResult<{ signedOut: true }>>;
  getSnapshot(): Promise<AuthOperationResult<AuthStateSnapshot>>;
  subscribe(listener: (state: AuthStateSnapshot) => void): () => void;
}

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return (
    typeof value === "string" &&
    AUTH_ERROR_CODES.some((errorCode) => errorCode === value)
  );
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 20 &&
    Number.isFinite(Date.parse(value))
  );
}

function hasExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(record).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === [...expectedKeys].sort()[index])
  );
}

export function isAuthSessionSnapshot(
  value: unknown,
): value is AuthSessionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    !hasExactKeys(record, [
      "userId",
      "email",
      "accessStatus",
      "entitlementDurationDays",
      "entitlementEndsAt",
      "offlineUntil",
      "deviceId",
      "activeDeviceCount",
      "lastValidatedAt",
      "isOffline",
    ])
  ) {
    return false;
  }

  return (
    typeof record.userId === "string" &&
    record.userId.length > 0 &&
    typeof record.email === "string" &&
    record.email.includes("@") &&
    ACCESS_STATUSES.some((status) => status === record.accessStatus) &&
    ENTITLEMENT_DURATION_DAYS.some(
      (duration) => duration === record.entitlementDurationDays,
    ) &&
    isIsoDate(record.entitlementEndsAt) &&
    isIsoDate(record.offlineUntil) &&
    typeof record.deviceId === "string" &&
    record.deviceId.length > 0 &&
    Number.isInteger(record.activeDeviceCount) &&
    Number(record.activeDeviceCount) >= 0 &&
    isIsoDate(record.lastValidatedAt) &&
    typeof record.isOffline === "boolean"
  );
}
