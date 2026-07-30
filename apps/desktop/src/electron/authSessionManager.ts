import {
  CloudAuthClientError,
  type CloudAuthClient,
  type CloudAuthDevice,
  type CloudSessionBundle,
  type CloudSessionValidation,
} from "../../../../packages/api-client/src/auth.ts";
import type {
  AuthOperationResult,
  AuthPhase,
  AuthSessionSnapshot,
  AuthStateSnapshot,
  EmailCodeRequestResult,
  LoginInput,
  LoginResult,
  PasswordResetResult,
  RedeemInviteInput,
  RegisterInput,
  RegistrationResult,
  RenewEntitlementInput,
  RequestPasswordResetInput,
  RequestRegistrationCodeInput,
  ResetPasswordInput,
} from "../../../../packages/shared/src/auth.ts";

import type { AuthTokenStore, PersistedAuthTokenMaterial } from "./authTokenStore.ts";
import { restoreOfflineSession } from "./offlineAuthLease.ts";

interface CreateAuthSessionManagerInput {
  client: CloudAuthClient;
  tokenStore: AuthTokenStore;
  device: CloudAuthDevice;
  offlinePublicKeyPem: string;
  now?: () => Date;
}

export interface AuthSessionManager {
  bootstrap(): Promise<AuthOperationResult<AuthStateSnapshot>>;
  requestRegistrationCode(
    input: RequestRegistrationCodeInput,
  ): Promise<AuthOperationResult<EmailCodeRequestResult>>;
  register(input: RegisterInput): Promise<AuthOperationResult<RegistrationResult>>;
  login(input: LoginInput): Promise<AuthOperationResult<LoginResult>>;
  redeemInvite(input: RedeemInviteInput): Promise<AuthOperationResult<AuthSessionSnapshot>>;
  renewEntitlement(input: RenewEntitlementInput): Promise<AuthOperationResult<AuthSessionSnapshot>>;
  requestPasswordReset(
    input: RequestPasswordResetInput,
  ): Promise<AuthOperationResult<EmailCodeRequestResult>>;
  resetPassword(input: ResetPasswordInput): Promise<AuthOperationResult<PasswordResetResult>>;
  logout(): Promise<AuthOperationResult<{ signedOut: true }>>;
  getSnapshot(): Promise<AuthOperationResult<AuthStateSnapshot>>;
  revalidate(): Promise<AuthOperationResult<AuthStateSnapshot>>;
  subscribe(listener: (state: AuthStateSnapshot) => void): () => void;
}

function initialState(): AuthStateSnapshot {
  return {
    phase: "BOOTSTRAPPING",
    session: null,
    errorCode: null,
  };
}

function operationError(error: unknown): AuthOperationResult<never> {
  if (error instanceof CloudAuthClientError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "Authentication operation failed",
    },
  };
}

function phaseForError(error: CloudAuthClientError): AuthPhase {
  if (error.code === "ENTITLEMENT_EXPIRED") {
    return "ENTITLEMENT_EXPIRED";
  }
  if (error.code === "NETWORK_UNAVAILABLE" || error.code === "SERVICE_UNAVAILABLE") {
    return "SERVICE_UNAVAILABLE";
  }
  return "SIGNED_OUT";
}

export function createAuthSessionManager(input: CreateAuthSessionManagerInput): AuthSessionManager {
  const now = input.now ?? (() => new Date());
  const listeners = new Set<(state: AuthStateSnapshot) => void>();
  let state = initialState();
  let persistedMaterial: PersistedAuthTokenMaterial | null = null;
  let loginChallenge: string | null = null;
  let bootstrapPromise: Promise<AuthOperationResult<AuthStateSnapshot>> | null = null;
  let revalidationPromise: Promise<AuthOperationResult<AuthStateSnapshot>> | null = null;
  let authenticationGeneration = 0;

  function publish(nextState: AuthStateSnapshot): void {
    state = nextState;
    for (const listener of listeners) {
      listener({ ...state });
    }
  }

  function publishPhase(phase: AuthPhase, session: AuthSessionSnapshot | null = null): void {
    publish({
      phase,
      session,
      errorCode: null,
    });
  }

  async function commitBundle(
    bundle: CloudSessionBundle,
    expectedGeneration = authenticationGeneration,
  ): Promise<AuthSessionSnapshot> {
    if (expectedGeneration !== authenticationGeneration) {
      throw new StaleAuthenticationOperationError();
    }
    if (bundle.session.deviceId !== input.device.deviceId) {
      throw new CloudAuthClientError(
        "SERVICE_UNAVAILABLE",
        "Authentication response device does not match this computer",
      );
    }
    persistedMaterial = {
      refreshToken: bundle.refreshToken,
      offlineLease: bundle.offlineLease,
      deviceId: input.device.deviceId,
      lastServerTime: bundle.session.lastValidatedAt,
    };
    await input.tokenStore.save({
      accessToken: bundle.accessToken,
      ...persistedMaterial,
    });
    if (expectedGeneration !== authenticationGeneration) {
      await input.tokenStore.clear().catch(() => undefined);
      throw new StaleAuthenticationOperationError();
    }
    loginChallenge = null;
    publishPhase("AUTHENTICATED_ONLINE", bundle.session);
    return bundle.session;
  }

  async function updateValidation(
    validation: CloudSessionValidation,
    expectedGeneration = authenticationGeneration,
  ): Promise<AuthSessionSnapshot> {
    if (expectedGeneration !== authenticationGeneration) {
      throw new StaleAuthenticationOperationError();
    }
    const accessToken = input.tokenStore.getAccessToken();
    if (!accessToken || !persistedMaterial) {
      throw new CloudAuthClientError("SESSION_REVOKED", "Session material is unavailable");
    }
    if (validation.session.deviceId !== input.device.deviceId) {
      throw new CloudAuthClientError(
        "SERVICE_UNAVAILABLE",
        "Authentication response device does not match this computer",
      );
    }
    persistedMaterial = {
      ...persistedMaterial,
      offlineLease: validation.offlineLease,
      lastServerTime: validation.session.lastValidatedAt,
    };
    await input.tokenStore.save({
      accessToken,
      ...persistedMaterial,
    });
    if (expectedGeneration !== authenticationGeneration) {
      await input.tokenStore.clear().catch(() => undefined);
      throw new StaleAuthenticationOperationError();
    }
    publishPhase("AUTHENTICATED_ONLINE", validation.session);
    return validation.session;
  }

  async function clearAuthentication(): Promise<void> {
    persistedMaterial = null;
    loginChallenge = null;
    await input.tokenStore.clear().catch(() => undefined);
  }

  async function refreshFromPersisted(
    expectedGeneration = authenticationGeneration,
  ): Promise<AuthSessionSnapshot> {
    if (!persistedMaterial) {
      throw new CloudAuthClientError("SESSION_REVOKED", "No persisted session is available");
    }
    return commitBundle(
      await input.client.refreshSession(persistedMaterial.refreshToken, input.device),
      expectedGeneration,
    );
  }

  async function validateOnlineSession(
    expectedGeneration = authenticationGeneration,
  ): Promise<AuthSessionSnapshot> {
    const accessToken = input.tokenStore.getAccessToken();
    if (!accessToken) {
      return refreshFromPersisted(expectedGeneration);
    }
    try {
      return await updateValidation(await input.client.getSession(accessToken), expectedGeneration);
    } catch (error) {
      if (
        error instanceof CloudAuthClientError &&
        error.code === "SESSION_REVOKED" &&
        persistedMaterial
      ) {
        return refreshFromPersisted(expectedGeneration);
      }
      throw error;
    }
  }

  async function performBootstrap(): Promise<AuthOperationResult<AuthStateSnapshot>> {
    const expectedGeneration = authenticationGeneration;
    publishPhase("BOOTSTRAPPING");
    persistedMaterial = await input.tokenStore.restore();
    if (!persistedMaterial) {
      publishPhase("SIGNED_OUT");
      return { ok: true, data: state };
    }
    if (persistedMaterial.deviceId !== input.device.deviceId) {
      await clearAuthentication();
      publishPhase("SIGNED_OUT");
      return { ok: true, data: state };
    }

    try {
      await refreshFromPersisted(expectedGeneration);
      return { ok: true, data: state };
    } catch (error) {
      if (error instanceof CloudAuthClientError && error.code === "NETWORK_UNAVAILABLE") {
        try {
          const offlineSession = restoreOfflineSession({
            lease: persistedMaterial.offlineLease,
            publicKeyPem: input.offlinePublicKeyPem,
            deviceId: input.device.deviceId,
            lastServerTime: persistedMaterial.lastServerTime,
            now: now(),
          });
          publishPhase("AUTHENTICATED_OFFLINE", offlineSession);
          return { ok: true, data: state };
        } catch {
          await clearAuthentication();
          publish({
            phase: "SERVICE_UNAVAILABLE",
            session: null,
            errorCode: "NETWORK_UNAVAILABLE",
          });
          return { ok: true, data: state };
        }
      }

      await clearAuthentication();
      const clientError =
        error instanceof CloudAuthClientError
          ? error
          : new CloudAuthClientError("SERVICE_UNAVAILABLE", "Authentication bootstrap failed");
      publish({
        phase: phaseForError(clientError),
        session: null,
        errorCode: clientError.code,
      });
      return { ok: true, data: state };
    }
  }

  async function performRevalidation(): Promise<AuthOperationResult<AuthStateSnapshot>> {
    if (state.phase === "BOOTSTRAPPING" || state.phase === "SERVICE_UNAVAILABLE") {
      return manager.bootstrap();
    }
    if (
      (state.phase !== "AUTHENTICATED_ONLINE" && state.phase !== "AUTHENTICATED_OFFLINE") ||
      !state.session
    ) {
      return { ok: true, data: { ...state } };
    }
    const expectedGeneration = authenticationGeneration;
    try {
      await validateOnlineSession(expectedGeneration);
      return { ok: true, data: state };
    } catch (error) {
      if (error instanceof StaleAuthenticationOperationError) {
        return { ok: true, data: { ...state } };
      }
      if (
        error instanceof CloudAuthClientError &&
        error.code === "NETWORK_UNAVAILABLE" &&
        (state.phase === "AUTHENTICATED_ONLINE" || state.phase === "AUTHENTICATED_OFFLINE")
      ) {
        try {
          if (!persistedMaterial) {
            throw new Error("offline session material is unavailable", { cause: error });
          }
          const offlineSession = restoreOfflineSession({
            lease: persistedMaterial.offlineLease,
            publicKeyPem: input.offlinePublicKeyPem,
            deviceId: input.device.deviceId,
            lastServerTime: persistedMaterial.lastServerTime,
            now: now(),
          });
          publishPhase("AUTHENTICATED_OFFLINE", offlineSession);
          return { ok: true, data: state };
        } catch {
          const entitlementEndsAt = state.session?.entitlementEndsAt;
          if (entitlementEndsAt && now().getTime() >= Date.parse(entitlementEndsAt)) {
            await clearAuthentication();
            publish({
              phase: "ENTITLEMENT_EXPIRED",
              session: null,
              errorCode: "ENTITLEMENT_EXPIRED",
            });
            return { ok: true, data: state };
          }
        }
      }
      await clearAuthentication();
      const clientError =
        error instanceof CloudAuthClientError
          ? error
          : new CloudAuthClientError("SERVICE_UNAVAILABLE", "Session validation failed");
      publish({
        phase: phaseForError(clientError),
        session: null,
        errorCode: clientError.code,
      });
      return operationError(clientError);
    }
  }

  const manager: AuthSessionManager = {
    bootstrap: () => {
      if (!bootstrapPromise) {
        bootstrapPromise = performBootstrap().finally(() => {
          bootstrapPromise = null;
        });
      }
      return bootstrapPromise;
    },
    requestRegistrationCode: async (request) => {
      try {
        return {
          ok: true,
          data: await input.client.requestRegistrationCode(request),
        };
      } catch (error) {
        return operationError(error);
      }
    },
    register: async (request) => {
      try {
        const result = await input.client.register(request);
        publishPhase("LOGIN");
        return { ok: true, data: result };
      } catch (error) {
        return operationError(error);
      }
    },
    login: async (request) => {
      loginChallenge = null;
      try {
        const result = await input.client.login(request, input.device);
        if (result.kind === "AUTHENTICATED") {
          const session = await commitBundle(result.bundle);
          return {
            ok: true,
            data: { kind: "AUTHENTICATED", session },
          };
        }
        if (result.kind === "INVITE_REQUIRED") {
          loginChallenge = result.loginChallenge;
          publishPhase("INVITE_REQUIRED");
          return { ok: true, data: { kind: "INVITE_REQUIRED" } };
        }
        if (result.kind === "ENTITLEMENT_EXPIRED") {
          loginChallenge = result.loginChallenge;
          publishPhase("ENTITLEMENT_EXPIRED");
          return {
            ok: true,
            data: {
              kind: "ENTITLEMENT_EXPIRED",
              expiredAt: result.expiredAt,
            },
          };
        }
        publishPhase("SIGNED_OUT");
        return { ok: true, data: { kind: "ACCESS_DENIED" } };
      } catch (error) {
        return operationError(error);
      }
    },
    redeemInvite: async (request) => {
      if (!loginChallenge) {
        return {
          ok: false,
          error: {
            code: "ACCESS_DENIED",
            message: "A verified login challenge is required",
          },
        };
      }
      try {
        const session = await commitBundle(
          await input.client.redeemInvite(
            {
              loginChallenge,
              inviteCode: request.inviteCode,
            },
            input.device,
          ),
        );
        return { ok: true, data: session };
      } catch (error) {
        return operationError(error);
      }
    },
    renewEntitlement: async (request) => {
      try {
        const renewal = await input.client.renewEntitlement(
          {
            inviteCode: request.inviteCode,
            ...(loginChallenge ? { loginChallenge } : {}),
            ...(input.tokenStore.getAccessToken()
              ? { accessToken: input.tokenStore.getAccessToken()! }
              : {}),
          },
          input.device,
        );
        const session =
          "accessToken" in renewal ? await commitBundle(renewal) : await updateValidation(renewal);
        return { ok: true, data: session };
      } catch (error) {
        return operationError(error);
      }
    },
    requestPasswordReset: async (request) => {
      try {
        return {
          ok: true,
          data: await input.client.requestPasswordReset(request),
        };
      } catch (error) {
        return operationError(error);
      }
    },
    resetPassword: async (request) => {
      try {
        const result = await input.client.resetPassword(request);
        authenticationGeneration += 1;
        await clearAuthentication();
        publishPhase("LOGIN");
        return { ok: true, data: result };
      } catch (error) {
        return operationError(error);
      }
    },
    logout: async () => {
      authenticationGeneration += 1;
      const accessToken = input.tokenStore.getAccessToken();
      if (accessToken) {
        await input.client.logout(accessToken).catch(() => undefined);
      }
      await clearAuthentication();
      publishPhase("SIGNED_OUT");
      return { ok: true, data: { signedOut: true } };
    },
    getSnapshot: async () => ({ ok: true, data: { ...state } }),
    revalidate: () => {
      if (!revalidationPromise) {
        revalidationPromise = performRevalidation().finally(() => {
          revalidationPromise = null;
        });
      }
      return revalidationPromise;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return manager;
}

class StaleAuthenticationOperationError extends Error {
  public constructor() {
    super("Authentication operation was superseded");
    this.name = "StaleAuthenticationOperationError";
  }
}
