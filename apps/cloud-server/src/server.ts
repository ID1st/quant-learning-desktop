import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Pool } from "pg";
import { latestPostgresMigrationVersion } from "./db/migrationVersion.ts";

import type { CloudAuthConfig } from "./config.ts";
import { AuthDomainError } from "./domain/authErrors.ts";
import { InviteBatchConflictError } from "./services/inviteBatchService.ts";
import { PgAuthRepository } from "./repositories/pgAuthRepository.ts";
import { PgAdminRepository } from "./repositories/pgAdminRepository.ts";
import { PgInviteBatchRepository } from "./repositories/pgInviteBatchRepository.ts";
import { argon2idPasswordHasher } from "./security/passwords.ts";
import { validateOfflineLeaseKeyPair } from "./security/signedArtifacts.ts";
import {
  createAuthService,
  type AuthRequestContext,
  type DeviceContext,
} from "./services/authService.ts";
import { AdminAuthError, AdminService, type AdminRequestContext } from "./services/adminService.ts";
import {
  AdminInviteError,
  AdminInviteService,
  type AdminInviteBatchInput,
} from "./services/adminInviteService.ts";

interface EmailBody {
  email: string;
}

interface RegistrationBody {
  email: string;
  emailCode: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface InviteBody {
  loginChallenge: string;
  inviteCode: string;
}

interface RenewalBody {
  inviteCode: string;
  loginChallenge?: string;
}

interface RefreshBody {
  refreshToken: string;
}

interface AdminLoginBody {
  email: string;
  emailCode: string;
}

export interface AdminApiService {
  requestLoginCode(
    email: string,
    context: AdminRequestContext,
  ): Promise<{ accepted: true; retryAfterSeconds: 60 }>;
  login(
    input: AdminLoginBody,
    context: AdminRequestContext,
  ): Promise<{ admin: { email: string }; sessionToken: string }>;
  getSession(sessionToken: string, context: AdminRequestContext): Promise<{ email: string }>;
  logout(sessionToken: string, context: AdminRequestContext): Promise<{ signedOut: true }>;
  recordInviteAction(
    eventType: "ADMIN_INVITE_BATCH_CREATED" | "ADMIN_INVITE_BATCH_REVOKED",
    email: string,
    batchId: string,
    totalCount: number,
    context: AdminRequestContext,
  ): Promise<void>;
}

export type AdminInviteApiService = Pick<
  AdminInviteService,
  "createBatch" | "listBatches" | "revokeBatch"
>;

const ADMIN_ORIGIN = "https://fnndp.xyz";
const ADMIN_SESSION_COOKIE = "__Host-quant_admin";

const emailSchema = {
  type: "string",
  minLength: 3,
  maxLength: 254,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
} as const;

const passwordSchema = {
  type: "string",
  minLength: 8,
  maxLength: 64,
} as const;

const emailOnlyBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email"],
  properties: { email: emailSchema },
} as const;

const registrationBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "emailCode", "password"],
  properties: {
    email: emailSchema,
    emailCode: {
      type: "string",
      pattern: "^\\d{6}$",
    },
    password: passwordSchema,
  },
} as const;

const loginBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "password"],
  properties: {
    email: emailSchema,
    password: { type: "string", minLength: 1, maxLength: 64 },
  },
} as const;

const inviteCodeSchema = {
  type: "string",
  minLength: 18,
  maxLength: 64,
} as const;

const inviteBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["loginChallenge", "inviteCode"],
  properties: {
    loginChallenge: { type: "string", minLength: 32, maxLength: 2048 },
    inviteCode: inviteCodeSchema,
  },
} as const;

const renewalBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["inviteCode"],
  properties: {
    loginChallenge: { type: "string", minLength: 32, maxLength: 2048 },
    inviteCode: inviteCodeSchema,
  },
} as const;

const refreshBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["refreshToken"],
  properties: {
    refreshToken: { type: "string", minLength: 32, maxLength: 256 },
  },
} as const;

const adminLoginBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["email", "emailCode"],
  properties: {
    email: emailSchema,
    emailCode: {
      type: "string",
      pattern: "^\\d{6}$",
    },
  },
} as const;

const adminInviteBatchBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["entries", "claimDays"],
  properties: {
    entries: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["durationDays", "count"],
        properties: {
          durationDays: { type: "integer", enum: [7, 30, 90, 365] },
          count: { type: "integer", minimum: 1, maximum: 500 },
        },
      },
    },
    claimDays: { type: "integer", minimum: 1, maximum: 90 },
  },
} as const;

const adminInviteListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
} as const;

const adminInviteBatchParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["batchId"],
  properties: {
    batchId: {
      type: "string",
      pattern:
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    },
  },
} as const;

function requestContext(request: FastifyRequest): AuthRequestContext {
  return {
    now: new Date(),
    sourceIp: request.ip || null,
  };
}

function deviceContext(request: FastifyRequest): DeviceContext {
  const rawDeviceId = request.headers["x-device-id"];
  const rawDeviceLabel = request.headers["x-device-label"];
  return {
    deviceId: Array.isArray(rawDeviceId) ? (rawDeviceId[0] ?? "") : (rawDeviceId ?? ""),
    deviceLabel: Array.isArray(rawDeviceLabel) ? (rawDeviceLabel[0] ?? "") : (rawDeviceLabel ?? ""),
  };
}

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) {
    throw new AuthDomainError("SESSION_REVOKED", "Authentication is required", 401);
  }
  return match[1]!;
}

function assertAdminOrigin(request: FastifyRequest): void {
  if (request.headers.origin !== ADMIN_ORIGIN) {
    throw new AdminAuthError("administrator origin is not authorized", 403);
  }
}

function readAdminSessionCookie(request: FastifyRequest): string {
  const cookie = request.headers.cookie
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  const token = cookie?.slice(ADMIN_SESSION_COOKIE.length + 1) ?? "";
  if (!/^qad_[A-Za-z0-9_-]{40,}$/.test(token)) {
    throw new AdminAuthError("administrator session is invalid", 401);
  }
  return token;
}

function adminSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearedAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function success<T>(data: T): { data: T } {
  return { data };
}

export async function buildAuthServer(
  config: CloudAuthConfig,
  pool: Pool,
  options: {
    adminService?: AdminApiService;
    adminInviteService?: AdminInviteApiService;
  } = {},
): Promise<FastifyInstance> {
  validateOfflineLeaseKeyPair(config.offlineLeasePrivateKeyPem, config.offlineLeasePublicKeyPem);

  const server = Fastify({
    // Configure the exact host gateway address when running behind Docker/Nginx.
    trustProxy: config.trustedProxies ?? "loopback",
    bodyLimit: 16 * 1024,
    requestIdHeader: "x-request-id",
    logger: {
      level: process.env.AUTH_LOG_LEVEL || "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.emailCode",
          "req.body.inviteCode",
          "req.body.loginChallenge",
          "req.body.refreshToken",
          "res.headers.set-cookie",
        ],
        censor: "[REDACTED]",
      },
    },
  });
  await server.register(helmet, {
    contentSecurityPolicy: false,
  });
  await server.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
  });
  server.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  const repository = new PgAuthRepository(pool);
  const authService = await createAuthService({
    repository,
    config,
    passwordHasher: argon2idPasswordHasher,
  });
  const adminService =
    options.adminService ??
    new AdminService({
      repository: new PgAdminRepository(pool),
      emailCodePepper: config.emailCodePepper,
      tokenPepper: config.tokenPepper,
    });
  const adminInviteService =
    options.adminInviteService ??
    new AdminInviteService({
      pepper: config.inviteCodePepper,
      repository: new PgInviteBatchRepository(pool),
    });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof InviteBatchConflictError) {
      return reply
        .status(409)
        .send({ error: { code: "BATCH_ALREADY_CREATED", message: error.message } });
    }
    if (error instanceof AuthDomainError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      });
    }
    if (error instanceof AdminAuthError) {
      return reply.status(error.statusCode).send({
        error: {
          code: "ACCESS_DENIED",
          message: error.message,
        },
      });
    }
    if (error instanceof AdminInviteError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.statusCode === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
          message: error.message,
        },
      });
    }
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 429) {
      const retryAfterHeader = reply.getHeader("retry-after");
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          retryAfterSeconds: Number(retryAfterHeader) || 60,
        },
      });
    }
    if (error && typeof error === "object" && "validation" in error && error.validation) {
      return reply.status(400).send({
        error: {
          code: "ACCESS_DENIED",
          message: "Request validation failed",
        },
      });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      return reply.status(400).send({
        error: {
          code: "ACCESS_DENIED",
          message: "Request body is invalid",
        },
      });
    }

    const frameworkStatus =
      error && typeof error === "object" && "code" in error
        ? (
            {
              FST_ERR_CTP_BODY_TOO_LARGE: 413,
              FST_ERR_CTP_INVALID_MEDIA_TYPE: 415,
              FST_ERR_CTP_EMPTY_JSON_BODY: 400,
            } as Record<string, number>
          )[String(error.code)]
        : undefined;
    if (frameworkStatus) {
      return reply
        .status(frameworkStatus)
        .send({ error: { code: "INVALID_REQUEST", message: "Request body is not supported" } });
    }
    const errorRecord =
      error && typeof error === "object" ? (error as Record<string, unknown>) : null;
    const errorCode =
      typeof errorRecord?.code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(errorRecord.code)
        ? errorRecord.code
        : "UNKNOWN";
    request.log.error(
      {
        errorCode,
        errorName: error instanceof Error ? error.name : typeof error,
      },
      "authentication request failed",
    );
    return reply.status(503).send({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Authentication service is temporarily unavailable",
      },
    });
  });

  const readinessHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await pool.query<{ migrated: boolean }>(
        `
        SELECT
          to_regclass('public.users') IS NOT NULL
          AND to_regclass('public.invite_batches') IS NOT NULL
          AND to_regclass('public.invite_codes') IS NOT NULL
          AND to_regclass('public.invite_redemptions') IS NOT NULL
          AND to_regclass('public.entitlements') IS NOT NULL
          AND to_regclass('public.email_challenges') IS NOT NULL
          AND to_regclass('public.sessions') IS NOT NULL
          AND to_regclass('public.email_outbox') IS NOT NULL
          AND to_regclass('public.auth_audit_events') IS NOT NULL
          AND to_regclass('public.admin_accounts') IS NOT NULL
          AND to_regclass('public.admin_login_challenges') IS NOT NULL
          AND to_regclass('public.admin_sessions') IS NOT NULL
          AND (
            SELECT max(version)
            FROM schema_migrations
          ) = $1
          AS migrated
      `,
        [latestPostgresMigrationVersion],
      );
      if (result.rows[0]?.migrated !== true) {
        return reply.status(503).send({ status: "unavailable" });
      }
      return { status: "ok" };
    } catch {
      return reply.status(503).send({ status: "unavailable" });
    }
  };

  server.get("/health/live", async () => ({ status: "ok" }));
  server.get("/health/ready", readinessHandler);
  server.get("/health", readinessHandler);

  server.post<{ Body: EmailBody }>(
    "/v1/auth/email-code-requests",
    {
      schema: { body: emailOnlyBodySchema },
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (request) =>
      success(
        await authService.requestRegistrationCode(request.body.email, requestContext(request)),
      ),
  );

  server.post<{ Body: RegistrationBody }>(
    "/v1/auth/registrations",
    {
      schema: { body: registrationBodySchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request) => success(await authService.register(request.body, requestContext(request))),
  );

  server.post<{ Body: LoginBody }>(
    "/v1/auth/sessions",
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.login(request.body, deviceContext(request), requestContext(request)),
      ),
  );

  server.post<{ Body: InviteBody }>(
    "/v1/auth/invite-redemptions",
    {
      schema: { body: inviteBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.redeemInviteWithChallenge(
          request.body,
          deviceContext(request),
          requestContext(request),
        ),
      ),
  );

  server.post<{ Body: RenewalBody }>(
    "/v1/entitlements/renewals",
    {
      schema: { body: renewalBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request) => {
      if (request.body.loginChallenge) {
        return success(
          await authService.redeemInviteWithChallenge(
            {
              loginChallenge: request.body.loginChallenge,
              inviteCode: request.body.inviteCode,
            },
            deviceContext(request),
            requestContext(request),
          ),
        );
      }
      return success(
        await authService.renewEntitlement(
          {
            accessToken: readBearerToken(request),
            inviteCode: request.body.inviteCode,
          },
          requestContext(request),
        ),
      );
    },
  );

  server.post<{ Body: RefreshBody }>(
    "/v1/auth/session-refreshes",
    {
      schema: { body: refreshBodySchema },
      config: { rateLimit: { max: 20, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.refreshSession(
          request.body,
          deviceContext(request),
          requestContext(request),
        ),
      ),
  );

  server.delete("/v1/auth/sessions/current", async (request) =>
    success(await authService.logout(readBearerToken(request), requestContext(request))),
  );

  server.post<{ Body: EmailBody }>(
    "/v1/auth/password-reset-requests",
    {
      schema: { body: emailOnlyBodySchema },
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (request) =>
      success(await authService.requestPasswordReset(request.body.email, requestContext(request))),
  );

  server.post<{ Body: RegistrationBody }>(
    "/v1/auth/password-resets",
    {
      schema: { body: registrationBodySchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(await authService.resetPassword(request.body, requestContext(request))),
  );

  server.get("/v1/auth/session", async (request) =>
    success(await authService.getSession(readBearerToken(request), requestContext(request))),
  );

  server.post<{ Body: EmailBody }>(
    "/v1/admin/login-code-requests",
    {
      schema: { body: emailOnlyBodySchema },
      config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
    },
    async (request) => {
      assertAdminOrigin(request);
      return success(
        await adminService.requestLoginCode(request.body.email, requestContext(request)),
      );
    },
  );

  server.post<{ Body: AdminLoginBody }>(
    "/v1/admin/sessions",
    {
      schema: { body: adminLoginBodySchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      assertAdminOrigin(request);
      const result = await adminService.login(request.body, requestContext(request));
      reply.header("set-cookie", adminSessionCookie(result.sessionToken));
      return success({ admin: result.admin });
    },
  );

  server.get("/v1/admin/session", async (request) =>
    success({
      admin: await adminService.getSession(
        readAdminSessionCookie(request),
        requestContext(request),
      ),
    }),
  );

  server.delete("/v1/admin/session", async (request, reply) => {
    assertAdminOrigin(request);
    const result = await adminService.logout(
      readAdminSessionCookie(request),
      requestContext(request),
    );
    reply.header("set-cookie", clearedAdminSessionCookie());
    return success(result);
  });

  server.post<{ Body: AdminInviteBatchInput }>(
    "/v1/admin/invite-batches",
    {
      schema: { body: adminInviteBatchBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request) => {
      assertAdminOrigin(request);
      const context = requestContext(request);
      const admin = await adminService.getSession(readAdminSessionCookie(request), context);
      const key = request.headers["idempotency-key"];
      if (key !== undefined && typeof key !== "string")
        throw new AdminInviteError("invalid idempotency key", 400);
      const result = await adminInviteService.createBatch(request.body, admin.email, context.now, {
        sourceIp: context.sourceIp,
        requestId: key,
      });
      return success(result);
    },
  );

  server.get<{
    Querystring: { page?: number; pageSize?: number };
  }>(
    "/v1/admin/invite-batches",
    { schema: { querystring: adminInviteListQuerySchema } },
    async (request) => {
      await adminService.getSession(readAdminSessionCookie(request), requestContext(request));
      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 20;
      const result = await adminInviteService.listBatches(page, pageSize);
      return success({
        items: result.items,
        pagination: {
          page,
          pageSize,
          totalItems: result.totalItems,
          totalPages: Math.ceil(result.totalItems / pageSize),
        },
      });
    },
  );

  server.post<{ Params: { batchId: string } }>(
    "/v1/admin/invite-batches/:batchId/revocations",
    { schema: { params: adminInviteBatchParamsSchema } },
    async (request) => {
      assertAdminOrigin(request);
      const context = requestContext(request);
      const admin = await adminService.getSession(readAdminSessionCookie(request), context);
      const result = await adminInviteService.revokeBatch(request.params.batchId, context.now, {
        email: admin.email,
        sourceIp: context.sourceIp,
      });
      return success(result);
    },
  );

  return server;
}
