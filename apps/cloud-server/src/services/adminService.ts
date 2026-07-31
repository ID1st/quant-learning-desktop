import { createHmac } from "node:crypto";

import { normalizeEmailAddress } from "../security/emailAddresses.ts";
import {
  digestEmailCode,
  generateEmailCode,
  generateOpaqueToken,
} from "../security/tokens.ts";

export type AdminProvisionResult = "CREATED" | "EXISTING";

export interface AdminProvisionRepository {
  provisionAccount(
    email: string,
    now: Date,
  ): Promise<AdminProvisionResult | "CONFLICT">;
}

export async function provisionAdminAccount(
  repository: AdminProvisionRepository,
  rawEmail: string,
  now = new Date(),
): Promise<AdminProvisionResult> {
  const result = await repository.provisionAccount(normalizeEmailAddress(rawEmail), now);
  if (result === "CONFLICT") {
    throw new Error("a different administrator is already provisioned");
  }
  return result;
}

export interface AdminRequestContext {
  now: Date;
  sourceIp: string | null;
}

export interface AdminAccountIdentity {
  id: string;
  email: string;
}

export interface AdminRepository extends AdminProvisionRepository {
  createLoginChallenge(input: {
    email: string;
    codeDigest: Buffer;
    plaintextCode: string;
    expiresAt: Date;
    requestedIp: string | null;
    now: Date;
  }): Promise<boolean>;
  consumeLoginChallenge(input: {
    email: string;
    observedCodeDigest: Buffer;
    tokenDigest: Buffer;
    sessionExpiresAt: Date;
    now: Date;
  }): Promise<
    | { kind: "AUTHENTICATED"; admin: AdminAccountIdentity }
    | { kind: "INVALID" | "EXPIRED" | "DISABLED" }
  >;
  findSession(tokenDigest: Buffer, now: Date): Promise<AdminAccountIdentity | null>;
  revokeSession(tokenDigest: Buffer, now: Date): Promise<void>;
  recordAuditEvent(input: {
    eventType: string;
    email: string | null;
    sourceIp: string | null;
    now: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export class AdminAuthError extends Error {
  public readonly statusCode: 400 | 401 | 403;

  public constructor(
    message: string,
    statusCode: 400 | 401 | 403,
  ) {
    super(message);
    this.name = "AdminAuthError";
    this.statusCode = statusCode;
  }
}

const LOGIN_CODE_LIFETIME_MILLISECONDS = 10 * 60 * 1_000;
const ADMIN_SESSION_LIFETIME_MILLISECONDS = 12 * 60 * 60 * 1_000;

function digestAdminSessionToken(token: string, pepper: string): Buffer {
  if (!/^qad_[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new AdminAuthError("administrator session is invalid", 401);
  }
  return createHmac("sha256", pepper)
    .update(`admin-session\n${token}`, "utf8")
    .digest();
}

export class AdminService {
  private readonly dependencies: {
    repository: AdminRepository;
    emailCodePepper: string;
    tokenPepper: string;
  };

  public constructor(
    dependencies: {
      repository: AdminRepository;
      emailCodePepper: string;
      tokenPepper: string;
    },
  ) {
    this.dependencies = dependencies;
  }

  private async safeAudit(input: {
    eventType: string;
    email: string | null;
    context: AdminRequestContext;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.dependencies.repository
      .recordAuditEvent({
        eventType: input.eventType,
        email: input.email,
        sourceIp: input.context.sourceIp,
        now: input.context.now,
        metadata: input.metadata,
      })
      .catch(() => undefined);
  }

  public async requestLoginCode(
    rawEmail: string,
    context: AdminRequestContext,
  ): Promise<{ accepted: true; retryAfterSeconds: 60 }> {
    const email = normalizeEmailAddress(rawEmail);
    const plaintextCode = generateEmailCode();
    await this.dependencies.repository.createLoginChallenge({
      email,
      codeDigest: digestEmailCode(
        email,
        "ADMIN_LOGIN",
        plaintextCode,
        this.dependencies.emailCodePepper,
      ),
      plaintextCode,
      expiresAt: new Date(context.now.getTime() + LOGIN_CODE_LIFETIME_MILLISECONDS),
      requestedIp: context.sourceIp,
      now: context.now,
    });
    await this.safeAudit({
      eventType: "ADMIN_LOGIN_CODE_REQUESTED",
      email,
      context,
    });
    return { accepted: true, retryAfterSeconds: 60 };
  }

  public async login(
    input: { email: string; emailCode: string },
    context: AdminRequestContext,
  ): Promise<{ admin: { email: string }; sessionToken: string }> {
    const email = normalizeEmailAddress(input.email);
    if (!/^\d{6}$/.test(input.emailCode)) {
      throw new AdminAuthError("administrator login was not accepted", 400);
    }
    const sessionToken = generateOpaqueToken("qad");
    const result = await this.dependencies.repository.consumeLoginChallenge({
      email,
      observedCodeDigest: digestEmailCode(
        email,
        "ADMIN_LOGIN",
        input.emailCode,
        this.dependencies.emailCodePepper,
      ),
      tokenDigest: digestAdminSessionToken(sessionToken, this.dependencies.tokenPepper),
      sessionExpiresAt: new Date(
        context.now.getTime() + ADMIN_SESSION_LIFETIME_MILLISECONDS,
      ),
      now: context.now,
    });
    if (result.kind !== "AUTHENTICATED") {
      await this.safeAudit({
        eventType: "ADMIN_LOGIN_FAILED",
        email,
        context,
        metadata: { reason: result.kind },
      });
      throw new AdminAuthError("administrator login was not accepted", 401);
    }
    await this.safeAudit({
      eventType: "ADMIN_LOGIN_SUCCEEDED",
      email,
      context,
    });
    return {
      admin: { email: result.admin.email },
      sessionToken,
    };
  }

  public async getSession(
    sessionToken: string,
    context: AdminRequestContext,
  ): Promise<{ email: string }> {
    const admin = await this.dependencies.repository.findSession(
      digestAdminSessionToken(sessionToken, this.dependencies.tokenPepper),
      context.now,
    );
    if (!admin) {
      throw new AdminAuthError("administrator session is invalid", 401);
    }
    return { email: admin.email };
  }

  public async logout(
    sessionToken: string,
    context: AdminRequestContext,
  ): Promise<{ signedOut: true }> {
    const tokenDigest = digestAdminSessionToken(
      sessionToken,
      this.dependencies.tokenPepper,
    );
    const admin = await this.dependencies.repository.findSession(
      tokenDigest,
      context.now,
    );
    await this.dependencies.repository.revokeSession(tokenDigest, context.now);
    await this.safeAudit({
      eventType: "ADMIN_LOGOUT",
      email: admin?.email ?? null,
      context,
    });
    return { signedOut: true };
  }

  public async recordInviteAction(
    eventType: "ADMIN_INVITE_BATCH_CREATED" | "ADMIN_INVITE_BATCH_REVOKED",
    email: string,
    batchId: string,
    totalCount: number,
    context: AdminRequestContext,
  ): Promise<void> {
    await this.safeAudit({
      eventType,
      email,
      context,
      metadata: { batchId, totalCount },
    });
  }
}
