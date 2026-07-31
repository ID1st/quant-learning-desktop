import {
  isAuthErrorCode,
  isAuthSessionSnapshot,
  type AuthErrorCode,
  type AuthSessionSnapshot,
  type EmailCodeRequestResult,
  type PasswordResetResult,
  type RegistrationResult,
} from "../../shared/src/auth.ts";

export interface CloudAuthDevice {
  deviceId: string;
  deviceLabel: string;
}

export interface CloudSessionBundle {
  accessToken: string;
  refreshToken: string;
  offlineLease: string;
  session: AuthSessionSnapshot;
}

export type CloudLoginResult =
  | { kind: "AUTHENTICATED"; bundle: CloudSessionBundle }
  | { kind: "INVITE_REQUIRED"; loginChallenge: string }
  | {
      kind: "ENTITLEMENT_EXPIRED";
      expiredAt: string;
      loginChallenge: string;
    }
  | { kind: "ACCESS_DENIED" };

export interface CloudSessionValidation {
  session: AuthSessionSnapshot;
  offlineLease: string;
}

export type CloudRenewalResult = CloudSessionBundle | CloudSessionValidation;

export class CloudAuthClientError extends Error {
  public readonly code: AuthErrorCode;
  public readonly retryAfterSeconds?: number;
  public readonly requestId?: string;

  public constructor(
    code: AuthErrorCode,
    message: string,
    retryAfterSeconds?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = "CloudAuthClientError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }

  public toJSON(): {
    code: AuthErrorCode;
    message: string;
    retryAfterSeconds?: number;
    requestId?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.retryAfterSeconds ? { retryAfterSeconds: this.retryAfterSeconds } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
    };
  }
}

interface CloudAuthClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  timeoutMilliseconds?: number;
}

interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  accessToken?: string;
  device?: CloudAuthDevice;
}

export interface CloudAuthClient {
  requestRegistrationCode(input: { email: string }): Promise<EmailCodeRequestResult>;
  register(input: {
    email: string;
    emailCode: string;
    password: string;
  }): Promise<RegistrationResult>;
  login(
    input: { email: string; password: string },
    device: CloudAuthDevice,
  ): Promise<CloudLoginResult>;
  redeemInvite(
    input: { loginChallenge: string; inviteCode: string },
    device: CloudAuthDevice,
  ): Promise<CloudSessionBundle>;
  renewEntitlement(
    input: {
      inviteCode: string;
      loginChallenge?: string;
      accessToken?: string;
    },
    device: CloudAuthDevice,
  ): Promise<CloudRenewalResult>;
  refreshSession(refreshToken: string, device: CloudAuthDevice): Promise<CloudSessionBundle>;
  logout(accessToken: string): Promise<{ signedOut: true }>;
  requestPasswordReset(input: { email: string }): Promise<EmailCodeRequestResult>;
  resetPassword(input: {
    email: string;
    emailCode: string;
    password: string;
  }): Promise<PasswordResetResult>;
  getSession(accessToken: string): Promise<CloudSessionValidation>;
}

function normalizeBaseUrl(rawBaseUrl: string): string {
  const url = new URL(rawBaseUrl);
  const isLoopback =
    url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(isLoopback && url.protocol === "http:")) {
    throw new Error("Remote authentication endpoints must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Authentication endpoint URL is invalid");
  }
  return url.toString().replace(/\/$/, "");
}

function safeMessage(code: AuthErrorCode): string {
  if (code === "NETWORK_UNAVAILABLE") {
    return "Authentication network is unavailable";
  }
  if (code === "SERVICE_UNAVAILABLE") {
    return "Authentication service is temporarily unavailable";
  }
  return "Authentication request was rejected";
}

type UnknownRecord = Record<string, unknown>;

function invalidResponse(): never {
  throw new CloudAuthClientError("SERVICE_UNAVAILABLE", safeMessage("SERVICE_UNAVAILABLE"));
}

function requireExactRecord(value: unknown, keys: readonly string[]): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidResponse();
  }
  const record = value as UnknownRecord;
  const observedKeys = Object.keys(record).sort();
  const expectedKeys = [...keys].sort();
  if (
    observedKeys.length !== expectedKeys.length ||
    observedKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalidResponse();
  }
  return record;
}

function requireBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string" || value.length < minimumLength || value.length > maximumLength) {
    return invalidResponse();
  }
  return value;
}

function parseEmailCodeRequestResult(value: unknown): EmailCodeRequestResult {
  const record = requireExactRecord(value, ["accepted", "retryAfterSeconds"]);
  if (
    record.accepted !== true ||
    !Number.isInteger(record.retryAfterSeconds) ||
    Number(record.retryAfterSeconds) < 1 ||
    Number(record.retryAfterSeconds) > 3_600
  ) {
    return invalidResponse();
  }
  return {
    accepted: true,
    retryAfterSeconds: Number(record.retryAfterSeconds),
  };
}

function parseRegistrationResult(value: unknown): RegistrationResult {
  const record = requireExactRecord(value, ["email"]);
  return {
    email: requireBoundedString(record.email, 3, 254),
  };
}

function parsePasswordResetResult(value: unknown): PasswordResetResult {
  const record = requireExactRecord(value, ["sessionsRevoked"]);
  if (record.sessionsRevoked !== true) {
    return invalidResponse();
  }
  return { sessionsRevoked: true };
}

function parseOnlineSession(value: unknown): AuthSessionSnapshot {
  if (!isAuthSessionSnapshot(value)) {
    return invalidResponse();
  }
  if (
    value.accessStatus !== "ACTIVE" ||
    value.isOffline ||
    value.activeDeviceCount < 1 ||
    value.activeDeviceCount > 2 ||
    Date.parse(value.offlineUntil) > Date.parse(value.entitlementEndsAt) ||
    Date.parse(value.lastValidatedAt) > Date.parse(value.offlineUntil)
  ) {
    return invalidResponse();
  }
  return value;
}

function parseSessionBundle(value: unknown): CloudSessionBundle {
  const record = requireExactRecord(value, [
    "accessToken",
    "refreshToken",
    "offlineLease",
    "session",
  ]);
  const accessToken = requireBoundedString(record.accessToken, 32, 256);
  const refreshToken = requireBoundedString(record.refreshToken, 32, 256);
  const offlineLease = requireBoundedString(record.offlineLease, 64, 8_192);
  if (
    !/^qat_[A-Za-z0-9_-]+$/.test(accessToken) ||
    !/^qrt_[A-Za-z0-9_-]+$/.test(refreshToken) ||
    offlineLease.split(".").length !== 2
  ) {
    return invalidResponse();
  }
  return {
    accessToken,
    refreshToken,
    offlineLease,
    session: parseOnlineSession(record.session),
  };
}

function parseSessionValidation(value: unknown): CloudSessionValidation {
  const record = requireExactRecord(value, ["offlineLease", "session"]);
  const offlineLease = requireBoundedString(record.offlineLease, 64, 8_192);
  if (offlineLease.split(".").length !== 2) {
    return invalidResponse();
  }
  return {
    offlineLease,
    session: parseOnlineSession(record.session),
  };
}

function parseLoginResult(value: unknown): CloudLoginResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidResponse();
  }
  const kind = (value as UnknownRecord).kind;
  if (kind === "AUTHENTICATED") {
    const record = requireExactRecord(value, ["kind", "bundle"]);
    return {
      kind,
      bundle: parseSessionBundle(record.bundle),
    };
  }
  if (kind === "INVITE_REQUIRED") {
    const record = requireExactRecord(value, ["kind", "loginChallenge"]);
    return {
      kind,
      loginChallenge: requireBoundedString(record.loginChallenge, 32, 2_048),
    };
  }
  if (kind === "ENTITLEMENT_EXPIRED") {
    const record = requireExactRecord(value, ["kind", "expiredAt", "loginChallenge"]);
    const expiredAt = requireBoundedString(record.expiredAt, 20, 64);
    if (!Number.isFinite(Date.parse(expiredAt))) {
      return invalidResponse();
    }
    return {
      kind,
      expiredAt,
      loginChallenge: requireBoundedString(record.loginChallenge, 32, 2_048),
    };
  }
  if (kind === "ACCESS_DENIED") {
    requireExactRecord(value, ["kind"]);
    return { kind };
  }
  return invalidResponse();
}

function parseRenewalResult(value: unknown): CloudRenewalResult {
  if (value && typeof value === "object" && !Array.isArray(value) && "accessToken" in value) {
    return parseSessionBundle(value);
  }
  return parseSessionValidation(value);
}

function parseLogoutResult(value: unknown): { signedOut: true } {
  const record = requireExactRecord(value, ["signedOut"]);
  if (record.signedOut !== true) {
    return invalidResponse();
  }
  return { signedOut: true };
}

export function createCloudAuthClient(options: CloudAuthClientOptions): CloudAuthClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;

  async function request<T>(
    path: string,
    parser: (value: unknown) => T,
    requestOptions: RequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMilliseconds);
    timer.unref?.();

    let response: Response;
    try {
      const headers = new Headers({
        accept: "application/json",
      });
      if (requestOptions.body !== undefined) {
        headers.set("content-type", "application/json");
      }
      if (requestOptions.accessToken) {
        headers.set("authorization", `Bearer ${requestOptions.accessToken}`);
      }
      if (requestOptions.device) {
        headers.set("x-device-id", requestOptions.device.deviceId);
        headers.set("x-device-label", requestOptions.device.deviceLabel);
      }

      response = await fetcher(`${baseUrl}${path}`, {
        method: requestOptions.method ?? "GET",
        headers,
        body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
        signal: controller.signal,
      });
    } catch {
      throw new CloudAuthClientError("NETWORK_UNAVAILABLE", safeMessage("NETWORK_UNAVAILABLE"));
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown = null;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const rawRequestId = response.headers.get("x-request-id");
      const requestId =
        rawRequestId && /^[A-Za-z0-9_.:-]{1,128}$/.test(rawRequestId) ? rawRequestId : undefined;
      const rawError =
        payload && typeof payload === "object" && "error" in payload
          ? (payload.error as Record<string, unknown>)
          : null;
      const rawCode = rawError?.code;
      const code = isAuthErrorCode(rawCode)
        ? rawCode
        : response.status >= 500
          ? "SERVICE_UNAVAILABLE"
          : response.status === 429
            ? "RATE_LIMITED"
            : "ACCESS_DENIED";
      const retryAfterSeconds =
        typeof rawError?.retryAfterSeconds === "number" ? rawError.retryAfterSeconds : undefined;
      throw new CloudAuthClientError(code, safeMessage(code), retryAfterSeconds, requestId);
    }

    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      return invalidResponse();
    }
    return parser(payload.data);
  }

  return {
    requestRegistrationCode: (input) =>
      request("/v1/auth/email-code-requests", parseEmailCodeRequestResult, {
        method: "POST",
        body: input,
      }),
    register: (input) =>
      request("/v1/auth/registrations", parseRegistrationResult, {
        method: "POST",
        body: input,
      }),
    login: (input, device) =>
      request("/v1/auth/sessions", parseLoginResult, {
        method: "POST",
        body: input,
        device,
      }),
    redeemInvite: (input, device) =>
      request("/v1/auth/invite-redemptions", parseSessionBundle, {
        method: "POST",
        body: input,
        device,
      }),
    renewEntitlement: (input, device) =>
      request("/v1/entitlements/renewals", parseRenewalResult, {
        method: "POST",
        body: {
          inviteCode: input.inviteCode,
          ...(input.loginChallenge ? { loginChallenge: input.loginChallenge } : {}),
        },
        accessToken: input.accessToken,
        device,
      }),
    refreshSession: (refreshToken, device) =>
      request("/v1/auth/session-refreshes", parseSessionBundle, {
        method: "POST",
        body: { refreshToken },
        device,
      }),
    logout: (accessToken) =>
      request("/v1/auth/sessions/current", parseLogoutResult, {
        method: "DELETE",
        accessToken,
      }),
    requestPasswordReset: (input) =>
      request("/v1/auth/password-reset-requests", parseEmailCodeRequestResult, {
        method: "POST",
        body: input,
      }),
    resetPassword: (input) =>
      request("/v1/auth/password-resets", parsePasswordResetResult, {
        method: "POST",
        body: input,
      }),
    getSession: (accessToken) =>
      request("/v1/auth/session", parseSessionValidation, {
        accessToken,
      }),
  };
}
