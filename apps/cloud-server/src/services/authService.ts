import type {
  AuthSessionSnapshot,
  EmailCodeRequestResult,
  EntitlementDurationDays,
  PasswordResetResult,
  RegistrationResult,
} from "../../../../packages/shared/src/auth.ts";

import type { CloudAuthConfig } from "../config.ts";
import { AuthDomainError } from "../domain/authErrors.ts";
import { validatePasswordPolicy } from "../domain/authDomain.ts";
import type {
  EntitlementRecord,
  PgAuthRepository,
  SessionIdentityRecord,
} from "../repositories/pgAuthRepository.ts";
import {
  createLoginChallenge,
  createOfflineLease,
  verifyLoginChallenge,
} from "../security/signedArtifacts.ts";
import type { PasswordHasher } from "../security/passwords.ts";
import {
  digestEmailCode,
  digestOpaqueToken,
  generateEmailCode,
  generateOpaqueToken,
} from "../security/tokens.ts";
import {
  digestInviteCode,
  normalizeInviteCode,
} from "../security/inviteCodes.ts";

export interface AuthRequestContext {
  now: Date;
  sourceIp: string | null;
}

export interface DeviceContext {
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

type AuthRepository = Pick<
  PgAuthRepository,
  | "createEmailChallenge"
  | "registerUser"
  | "resetPassword"
  | "userExists"
  | "findUserByEmail"
  | "redeemInvite"
  | "issueSession"
  | "findSessionByAccessDigest"
  | "rotateSession"
  | "countActiveDevices"
  | "revokeSession"
  | "recordAuditEvent"
>;

interface AuthServiceDependencies {
  repository: AuthRepository;
  config: Pick<
    CloudAuthConfig,
    | "emailCodePepper"
    | "inviteCodePepper"
    | "tokenPepper"
    | "loginChallengeSecret"
    | "offlineLeasePrivateKeyPem"
  >;
  passwordHasher: PasswordHasher;
  dummyPasswordHash: string;
}

const EMAIL_CODE_LIFETIME_MILLISECONDS = 10 * 60 * 1_000;
const ACCESS_TOKEN_LIFETIME_MILLISECONDS = 15 * 60 * 1_000;
const REFRESH_TOKEN_LIFETIME_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;
const OFFLINE_LEASE_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000;

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new AuthDomainError(
      "ACCESS_DENIED",
      "Email address is invalid",
      400,
    );
  }
  return normalized;
}

function assertEmailCode(code: string): void {
  if (!/^\d{6}$/.test(code)) {
    throw new AuthDomainError(
      "EMAIL_CODE_INVALID",
      "Email verification code is invalid",
      400,
    );
  }
}

function assertDevice(device: DeviceContext): void {
  if (
    !/^[A-Za-z0-9._:-]{8,128}$/.test(device.deviceId) ||
    device.deviceLabel.trim().length < 1 ||
    device.deviceLabel.trim().length > 128
  ) {
    throw new AuthDomainError(
      "ACCESS_DENIED",
      "Device identity is invalid",
      400,
    );
  }
}

function assertPassword(password: string): void {
  if (!validatePasswordPolicy(password).valid) {
    throw new AuthDomainError(
      "PASSWORD_POLICY_FAILED",
      "Password does not satisfy the password policy",
      400,
    );
  }
}

function calculateOfflineUntil(now: Date, entitlementEndsAt: Date): Date {
  return new Date(
    Math.min(
      now.getTime() + OFFLINE_LEASE_LIFETIME_MILLISECONDS,
      entitlementEndsAt.getTime(),
    ),
  );
}

export class AuthService {
  private readonly dependencies: AuthServiceDependencies;

  public constructor(dependencies: AuthServiceDependencies) {
    this.dependencies = dependencies;
  }

  private async safeAudit(input: {
    eventType: string;
    context: AuthRequestContext;
    userId?: string | null;
    email?: string | null;
    deviceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.dependencies.repository
      .recordAuditEvent({
        eventType: input.eventType,
        now: input.context.now,
        userId: input.userId,
        email: input.email,
        sourceIp: input.context.sourceIp,
        deviceId: input.deviceId,
        metadata: input.metadata,
      })
      .catch(() => undefined);
  }

  private async createEmailChallenge(
    email: string,
    purpose: "REGISTRATION" | "PASSWORD_RESET",
    context: AuthRequestContext,
  ): Promise<void> {
    const plaintextCode = generateEmailCode();
    await this.dependencies.repository.createEmailChallenge({
      email,
      purpose,
      codeDigest: digestEmailCode(
        email,
        purpose,
        plaintextCode,
        this.dependencies.config.emailCodePepper,
      ),
      plaintextCode,
      expiresAt: new Date(
        context.now.getTime() + EMAIL_CODE_LIFETIME_MILLISECONDS,
      ),
      requestedIp: context.sourceIp,
      now: context.now,
    });
  }

  public async requestRegistrationCode(
    rawEmail: string,
    context: AuthRequestContext,
  ): Promise<EmailCodeRequestResult> {
    const email = normalizeEmail(rawEmail);
    await this.createEmailChallenge(email, "REGISTRATION", context);
    await this.safeAudit({
      eventType: "REGISTRATION_CODE_REQUESTED",
      context,
      email,
    });
    return { accepted: true, retryAfterSeconds: 60 };
  }

  public async register(
    input: { email: string; emailCode: string; password: string },
    context: AuthRequestContext,
  ): Promise<RegistrationResult> {
    const email = normalizeEmail(input.email);
    assertEmailCode(input.emailCode);
    assertPassword(input.password);

    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.password,
    );
    const result = await this.dependencies.repository.registerUser({
      email,
      observedCodeDigest: digestEmailCode(
        email,
        "REGISTRATION",
        input.emailCode,
        this.dependencies.config.emailCodePepper,
      ),
      passwordHash,
      now: context.now,
    });
    if (result === "EXPIRED") {
      throw new AuthDomainError(
        "EMAIL_CODE_EXPIRED",
        "Email verification code has expired",
        400,
      );
    }
    if (result !== "CONSUMED") {
      throw new AuthDomainError(
        result === "USER_ALREADY_EXISTS"
          ? "ACCOUNT_ALREADY_EXISTS"
          : "EMAIL_CODE_INVALID",
        result === "USER_ALREADY_EXISTS"
          ? "Account already exists"
          : "Registration could not be completed",
        result === "USER_ALREADY_EXISTS" ? 409 : 400,
      );
    }

    await this.safeAudit({
      eventType: "USER_REGISTERED",
      context,
      email,
    });
    return { email };
  }

  private async buildSessionBundle(input: {
    userId: string;
    email: string;
    entitlement: EntitlementRecord;
    device: DeviceContext;
    now: Date;
  }): Promise<CloudSessionBundle> {
    const accessToken = generateOpaqueToken("qat");
    const refreshToken = generateOpaqueToken("qrt");
    const accessExpiresAt = new Date(
      input.now.getTime() + ACCESS_TOKEN_LIFETIME_MILLISECONDS,
    );
    const refreshExpiresAt = new Date(
      input.now.getTime() + REFRESH_TOKEN_LIFETIME_MILLISECONDS,
    );
    const issuedSession = await this.dependencies.repository.issueSession({
      userId: input.userId,
      deviceId: input.device.deviceId,
      deviceLabel: input.device.deviceLabel.trim(),
      accessTokenDigest: digestOpaqueToken(
        accessToken,
        this.dependencies.config.tokenPepper,
      ),
      refreshTokenDigest: digestOpaqueToken(
        refreshToken,
        this.dependencies.config.tokenPepper,
      ),
      accessExpiresAt,
      refreshExpiresAt,
      now: input.now,
    });
    if (!issuedSession) {
      throw new AuthDomainError(
        "ACCESS_DENIED",
        "The account is no longer authorized",
        403,
      );
    }
    const offlineUntil = calculateOfflineUntil(
      input.now,
      input.entitlement.endsAt,
    );
    const session: AuthSessionSnapshot = {
      userId: input.userId,
      email: input.email,
      accessStatus: "ACTIVE",
      entitlementDurationDays: input.entitlement.durationDays,
      entitlementEndsAt: input.entitlement.endsAt.toISOString(),
      offlineUntil: offlineUntil.toISOString(),
      deviceId: input.device.deviceId,
      activeDeviceCount: issuedSession.activeDeviceCount,
      lastValidatedAt: input.now.toISOString(),
      isOffline: false,
    };

    return {
      accessToken,
      refreshToken,
      session,
      offlineLease: createOfflineLease(
        {
          userId: session.userId,
          email: session.email,
          deviceId: session.deviceId,
          entitlementDurationDays: session.entitlementDurationDays,
          entitlementEndsAt: session.entitlementEndsAt,
          offlineUntil: session.offlineUntil,
          issuedAt: session.lastValidatedAt,
        },
        this.dependencies.config.offlineLeasePrivateKeyPem,
      ),
    };
  }

  public async login(
    input: { email: string; password: string },
    device: DeviceContext,
    context: AuthRequestContext,
  ): Promise<CloudLoginResult> {
    const email = normalizeEmail(input.email);
    assertDevice(device);
    const user = await this.dependencies.repository.findUserByEmail(email);
    const passwordMatches = await this.dependencies.passwordHasher.verify(
      user?.passwordHash ?? this.dependencies.dummyPasswordHash,
      input.password,
    );
    if (!user || !passwordMatches) {
      await this.safeAudit({
        eventType: "LOGIN_REJECTED",
        context,
        email,
        deviceId: device.deviceId,
        metadata: { reason: "INVALID_CREDENTIALS" },
      });
      throw new AuthDomainError(
        "INVALID_CREDENTIALS",
        "Email or password is incorrect",
        401,
      );
    }
    if (user.disabledAt) {
      await this.safeAudit({
        eventType: "LOGIN_REJECTED",
        context,
        email,
        userId: user.id,
        deviceId: device.deviceId,
        metadata: { reason: "DISABLED" },
      });
      return { kind: "ACCESS_DENIED" };
    }
    if (!user.entitlement) {
      return {
        kind: "INVITE_REQUIRED",
        loginChallenge: createLoginChallenge(
          {
            userId: user.id,
            email: user.email,
            authVersion: user.authVersion,
            reason: "INVITE_REQUIRED",
          },
          this.dependencies.config.loginChallengeSecret,
          context.now,
        ),
      };
    }
    if (user.entitlement.endsAt.getTime() <= context.now.getTime()) {
      return {
        kind: "ENTITLEMENT_EXPIRED",
        expiredAt: user.entitlement.endsAt.toISOString(),
        loginChallenge: createLoginChallenge(
          {
            userId: user.id,
            email: user.email,
            authVersion: user.authVersion,
            reason: "ENTITLEMENT_EXPIRED",
          },
          this.dependencies.config.loginChallengeSecret,
          context.now,
        ),
      };
    }

    const bundle = await this.buildSessionBundle({
      userId: user.id,
      email: user.email,
      entitlement: user.entitlement,
      device,
      now: context.now,
    });
    await this.safeAudit({
      eventType: "LOGIN_SUCCEEDED",
      context,
      email,
      userId: user.id,
      deviceId: device.deviceId,
    });
    return { kind: "AUTHENTICATED", bundle };
  }

  private mapInviteError(
    result: Exclude<
      Awaited<ReturnType<AuthRepository["redeemInvite"]>>,
      { kind: "REDEEMED" }
    >,
  ): never {
    if (result.kind === "EXPIRED") {
      throw new AuthDomainError(
        "INVITE_EXPIRED",
        "Invite code has expired",
        400,
      );
    }
    if (result.kind === "ALREADY_REDEEMED") {
      throw new AuthDomainError(
        "INVITE_ALREADY_REDEEMED",
        "Invite code has already been redeemed",
        409,
      );
    }
    throw new AuthDomainError(
      "INVITE_INVALID",
      "Invite code is invalid",
      400,
    );
  }

  private async redeemForUser(input: {
    userId: string;
    rawInviteCode: string;
    now: Date;
  }): Promise<EntitlementRecord> {
    let normalizedCode: string;
    try {
      normalizedCode = normalizeInviteCode(input.rawInviteCode);
    } catch {
      throw new AuthDomainError(
        "INVITE_INVALID",
        "Invite code is invalid",
        400,
      );
    }
    const result = await this.dependencies.repository.redeemInvite({
      userId: input.userId,
      codeDigest: digestInviteCode(
        normalizedCode,
        this.dependencies.config.inviteCodePepper,
      ),
      now: input.now,
    });
    if (result.kind !== "REDEEMED") {
      return this.mapInviteError(result);
    }
    return result.entitlement;
  }

  public async redeemInviteWithChallenge(
    input: { loginChallenge: string; inviteCode: string },
    device: DeviceContext,
    context: AuthRequestContext,
  ): Promise<CloudSessionBundle> {
    assertDevice(device);
    let claims: ReturnType<typeof verifyLoginChallenge>;
    try {
      claims = verifyLoginChallenge(
        input.loginChallenge,
        this.dependencies.config.loginChallengeSecret,
        context.now,
      );
    } catch {
      throw new AuthDomainError(
        "ACCESS_DENIED",
        "Login challenge is invalid or expired",
        401,
      );
    }

    const currentUser = await this.dependencies.repository.findUserByEmail(
      claims.email,
    );
    if (
      !currentUser ||
      currentUser.id !== claims.userId ||
      currentUser.disabledAt ||
      currentUser.authVersion !== claims.authVersion
    ) {
      throw new AuthDomainError(
        "ACCESS_DENIED",
        "Login challenge is no longer authorized",
        403,
      );
    }

    const entitlement = await this.redeemForUser({
      userId: claims.userId,
      rawInviteCode: input.inviteCode,
      now: context.now,
    });
    const bundle = await this.buildSessionBundle({
      userId: claims.userId,
      email: claims.email,
      entitlement,
      device,
      now: context.now,
    });
    await this.safeAudit({
      eventType: "INVITE_REDEEMED",
      context,
      userId: claims.userId,
      email: claims.email,
      deviceId: device.deviceId,
      metadata: { durationDays: entitlement.durationDays },
    });
    return bundle;
  }

  private async authorize(
    accessToken: string,
    context: AuthRequestContext,
  ): Promise<SessionIdentityRecord> {
    const identity =
      await this.dependencies.repository.findSessionByAccessDigest(
        digestOpaqueToken(
          accessToken,
          this.dependencies.config.tokenPepper,
        ),
        context.now,
      );
    if (!identity) {
      throw new AuthDomainError(
        "SESSION_REVOKED",
        "Session is invalid or has been revoked",
        401,
      );
    }
    if (identity.disabledAt) {
      await this.dependencies.repository.revokeSession(
        identity.sessionId,
        "USER_DISABLED",
        context.now,
      );
      throw new AuthDomainError("ACCESS_DENIED", "Access is denied", 403);
    }
    if (
      !identity.entitlement ||
      identity.entitlement.endsAt.getTime() <= context.now.getTime()
    ) {
      await this.dependencies.repository.revokeSession(
        identity.sessionId,
        "ENTITLEMENT_EXPIRED",
        context.now,
      );
      throw new AuthDomainError(
        "ENTITLEMENT_EXPIRED",
        "Entitlement has expired",
        403,
      );
    }
    return identity;
  }

  private async createValidationBundle(
    identity: SessionIdentityRecord,
    context: AuthRequestContext,
  ): Promise<{ session: AuthSessionSnapshot; offlineLease: string }> {
    const entitlement = identity.entitlement!;
    const offlineUntil = calculateOfflineUntil(
      context.now,
      entitlement.endsAt,
    );
    const session: AuthSessionSnapshot = {
      userId: identity.userId,
      email: identity.email,
      accessStatus: "ACTIVE",
      entitlementDurationDays: entitlement.durationDays,
      entitlementEndsAt: entitlement.endsAt.toISOString(),
      offlineUntil: offlineUntil.toISOString(),
      deviceId: identity.deviceId,
      activeDeviceCount:
        await this.dependencies.repository.countActiveDevices(
          identity.userId,
          context.now,
        ),
      lastValidatedAt: context.now.toISOString(),
      isOffline: false,
    };
    return {
      session,
      offlineLease: createOfflineLease(
        {
          userId: session.userId,
          email: session.email,
          deviceId: session.deviceId,
          entitlementDurationDays: session.entitlementDurationDays,
          entitlementEndsAt: session.entitlementEndsAt,
          offlineUntil: session.offlineUntil,
          issuedAt: session.lastValidatedAt,
        },
        this.dependencies.config.offlineLeasePrivateKeyPem,
      ),
    };
  }

  public async getSession(
    accessToken: string,
    context: AuthRequestContext,
  ): Promise<{ session: AuthSessionSnapshot; offlineLease: string }> {
    return this.createValidationBundle(
      await this.authorize(accessToken, context),
      context,
    );
  }

  public async renewEntitlement(
    input: { accessToken: string; inviteCode: string },
    context: AuthRequestContext,
  ): Promise<{ session: AuthSessionSnapshot; offlineLease: string }> {
    const identity = await this.authorize(input.accessToken, context);
    const entitlement = await this.redeemForUser({
      userId: identity.userId,
      rawInviteCode: input.inviteCode,
      now: context.now,
    });
    return this.createValidationBundle(
      { ...identity, entitlement },
      context,
    );
  }

  public async refreshSession(
    input: { refreshToken: string },
    device: DeviceContext,
    context: AuthRequestContext,
  ): Promise<CloudSessionBundle> {
    assertDevice(device);
    const accessToken = generateOpaqueToken("qat");
    const refreshToken = generateOpaqueToken("qrt");
    const identity = await this.dependencies.repository.rotateSession({
      refreshTokenDigest: digestOpaqueToken(
        input.refreshToken,
        this.dependencies.config.tokenPepper,
      ),
      deviceId: device.deviceId,
      nextAccessTokenDigest: digestOpaqueToken(
        accessToken,
        this.dependencies.config.tokenPepper,
      ),
      nextRefreshTokenDigest: digestOpaqueToken(
        refreshToken,
        this.dependencies.config.tokenPepper,
      ),
      accessExpiresAt: new Date(
        context.now.getTime() + ACCESS_TOKEN_LIFETIME_MILLISECONDS,
      ),
      refreshExpiresAt: new Date(
        context.now.getTime() + REFRESH_TOKEN_LIFETIME_MILLISECONDS,
      ),
      now: context.now,
    });
    if (!identity) {
      throw new AuthDomainError(
        "SESSION_REVOKED",
        "Session is invalid or has been revoked",
        401,
      );
    }
    if (
      identity.disabledAt ||
      !identity.entitlement ||
      identity.entitlement.endsAt.getTime() <= context.now.getTime()
    ) {
      await this.dependencies.repository.revokeSession(
        identity.sessionId,
        identity.disabledAt ? "USER_DISABLED" : "ENTITLEMENT_EXPIRED",
        context.now,
      );
      throw new AuthDomainError(
        identity.disabledAt ? "ACCESS_DENIED" : "ENTITLEMENT_EXPIRED",
        "Session is no longer authorized",
        403,
      );
    }

    const validation = await this.createValidationBundle(identity, context);
    return {
      accessToken,
      refreshToken,
      ...validation,
    };
  }

  public async logout(
    accessToken: string,
    context: AuthRequestContext,
  ): Promise<{ signedOut: true }> {
    const identity =
      await this.dependencies.repository.findSessionByAccessDigest(
        digestOpaqueToken(
          accessToken,
          this.dependencies.config.tokenPepper,
        ),
        context.now,
      );
    if (identity) {
      await this.dependencies.repository.revokeSession(
        identity.sessionId,
        "USER_LOGOUT",
        context.now,
      );
    }
    return { signedOut: true };
  }

  public async requestPasswordReset(
    rawEmail: string,
    context: AuthRequestContext,
  ): Promise<EmailCodeRequestResult> {
    const email = normalizeEmail(rawEmail);
    if (await this.dependencies.repository.userExists(email)) {
      await this.createEmailChallenge(email, "PASSWORD_RESET", context);
    }
    await this.safeAudit({
      eventType: "PASSWORD_RESET_REQUESTED",
      context,
      email,
    });
    return { accepted: true, retryAfterSeconds: 60 };
  }

  public async resetPassword(
    input: { email: string; emailCode: string; password: string },
    context: AuthRequestContext,
  ): Promise<PasswordResetResult> {
    const email = normalizeEmail(input.email);
    assertEmailCode(input.emailCode);
    assertPassword(input.password);
    const passwordHash = await this.dependencies.passwordHasher.hash(
      input.password,
    );
    const result = await this.dependencies.repository.resetPassword({
      email,
      observedCodeDigest: digestEmailCode(
        email,
        "PASSWORD_RESET",
        input.emailCode,
        this.dependencies.config.emailCodePepper,
      ),
      passwordHash,
      now: context.now,
    });
    if (result === "EXPIRED") {
      throw new AuthDomainError(
        "EMAIL_CODE_EXPIRED",
        "Email verification code has expired",
        400,
      );
    }
    if (result !== "CONSUMED") {
      throw new AuthDomainError(
        "EMAIL_CODE_INVALID",
        "Email verification code is invalid",
        400,
      );
    }
    await this.safeAudit({
      eventType: "PASSWORD_RESET_COMPLETED",
      context,
      email,
    });
    return { sessionsRevoked: true };
  }
}

export async function createAuthService(
  input: Omit<AuthServiceDependencies, "dummyPasswordHash">,
): Promise<AuthService> {
  const dummyPasswordHash = await input.passwordHasher.hash(
    "Dummy#Password2026",
  );
  return new AuthService({ ...input, dummyPasswordHash });
}
