import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { Pool } from "pg";

import type { CloudAuthConfig } from "./config.ts";
import { AuthDomainError } from "./domain/authErrors.ts";
import { PgAuthRepository } from "./repositories/pgAuthRepository.ts";
import { argon2idPasswordHasher } from "./security/passwords.ts";
import { validateOfflineLeaseKeyPair } from "./security/signedArtifacts.ts";
import {
  createAuthService,
  type AuthRequestContext,
  type DeviceContext,
} from "./services/authService.ts";

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
    deviceId: Array.isArray(rawDeviceId) ? rawDeviceId[0] ?? "" : rawDeviceId ?? "",
    deviceLabel: Array.isArray(rawDeviceLabel)
      ? rawDeviceLabel[0] ?? ""
      : rawDeviceLabel ?? "",
  };
}

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) {
    throw new AuthDomainError(
      "SESSION_REVOKED",
      "Authentication is required",
      401,
    );
  }
  return match[1]!;
}

function success<T>(data: T): { data: T } {
  return { data };
}

export async function buildAuthServer(
  config: CloudAuthConfig,
  pool: Pool,
): Promise<FastifyInstance> {
  validateOfflineLeaseKeyPair(
    config.offlineLeasePrivateKeyPem,
    config.offlineLeasePublicKeyPem,
  );

  const server = Fastify({
    // The container is reachable only through the host-loopback Nginx proxy.
    // Trust exactly that hop so rate limits key on the real client address.
    trustProxy: 1,
    bodyLimit: 16 * 1024,
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

  const repository = new PgAuthRepository(pool);
  const authService = await createAuthService({
    repository,
    config,
    passwordHasher: argon2idPasswordHasher,
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthDomainError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.retryAfterSeconds
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
      });
    }
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 429
    ) {
      const retryAfterHeader = reply.getHeader("retry-after");
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          retryAfterSeconds: Number(retryAfterHeader) || 60,
        },
      });
    }
    if (
      error &&
      typeof error === "object" &&
      "validation" in error &&
      error.validation
    ) {
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

    const errorRecord =
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : null;
    const errorCode =
      typeof errorRecord?.code === "string" &&
      /^[A-Za-z0-9_.-]{1,40}$/.test(errorRecord.code)
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

  const readinessHandler = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const result = await pool.query<{ migrated: boolean }>(`
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
          AS migrated
      `);
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
        await authService.requestRegistrationCode(
          request.body.email,
          requestContext(request),
        ),
      ),
  );

  server.post<{ Body: RegistrationBody }>(
    "/v1/auth/registrations",
    {
      schema: { body: registrationBodySchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.register(request.body, requestContext(request)),
      ),
  );

  server.post<{ Body: LoginBody }>(
    "/v1/auth/sessions",
    {
      schema: { body: loginBodySchema },
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.login(
          request.body,
          deviceContext(request),
          requestContext(request),
        ),
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

  server.delete(
    "/v1/auth/sessions/current",
    async (request) =>
      success(
        await authService.logout(
          readBearerToken(request),
          requestContext(request),
        ),
      ),
  );

  server.post<{ Body: EmailBody }>(
    "/v1/auth/password-reset-requests",
    {
      schema: { body: emailOnlyBodySchema },
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (request) =>
      success(
        await authService.requestPasswordReset(
          request.body.email,
          requestContext(request),
        ),
      ),
  );

  server.post<{ Body: RegistrationBody }>(
    "/v1/auth/password-resets",
    {
      schema: { body: registrationBodySchema },
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request) =>
      success(
        await authService.resetPassword(
          request.body,
          requestContext(request),
        ),
      ),
  );

  server.get("/v1/auth/session", async (request) =>
    success(
      await authService.getSession(
        readBearerToken(request),
        requestContext(request),
      ),
    ),
  );

  return server;
}
