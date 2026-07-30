import { app, BrowserWindow } from "electron";
import { join } from "node:path";

import type {
  CloudAuthClient,
  CloudSessionBundle,
} from "../../../../packages/api-client/src/auth.ts";

import { registerAuthIpcHandlers } from "./authIpc.ts";
import { createAuthSessionManager } from "./authSessionManager.ts";
import { createAuthTokenStore, type AuthEncryptedPersistence } from "./authTokenStore.ts";
import { createDesktopRendererSecurityPolicy } from "./electronSecurity.ts";

const bundle: CloudSessionBundle = {
  accessToken: "qat_smoke-access-token",
  refreshToken: "qrt_smoke-refresh-token",
  offlineLease: "signed-smoke-offline-lease",
  session: {
    userId: "smoke-user",
    email: "smoke@example.test",
    accessStatus: "ACTIVE",
    entitlementDurationDays: 30,
    entitlementEndsAt: "2026-08-27T00:00:00.000Z",
    offlineUntil: "2026-07-29T00:00:00.000Z",
    deviceId: "device-smoke",
    activeDeviceCount: 1,
    lastValidatedAt: "2026-07-28T00:00:00.000Z",
    isOffline: false,
  },
};

function createSmokeClient(): CloudAuthClient {
  const unexpected = async (): Promise<never> => {
    throw new Error("unexpected cloud authentication call");
  };
  return {
    requestRegistrationCode: unexpected,
    register: unexpected,
    login: async () => ({
      kind: "INVITE_REQUIRED",
      loginChallenge: "smoke-main-process-login-challenge",
    }),
    redeemInvite: async () => bundle,
    renewEntitlement: unexpected,
    refreshSession: unexpected,
    logout: async () => ({ signedOut: true }),
    requestPasswordReset: unexpected,
    resetPassword: unexpected,
    getSession: unexpected,
  };
}

void app.whenReady().then(async () => {
  let persistedValue: string | null = null;
  const persistence: AuthEncryptedPersistence = {
    read: async () => persistedValue,
    write: async (value) => {
      persistedValue = value;
    },
    remove: async () => {
      persistedValue = null;
    },
  };
  const manager = createAuthSessionManager({
    client: createSmokeClient(),
    tokenStore: createAuthTokenStore(persistence, {
      isEncryptionAvailable: () => true,
      encrypt: async (value) => Buffer.from(value, "utf8").toString("base64"),
      decrypt: async (value) => Buffer.from(value, "base64").toString("utf8"),
    }),
    device: {
      deviceId: "device-smoke",
      deviceLabel: "Auth smoke",
    },
    offlinePublicKeyPem: "",
    now: () => new Date("2026-07-28T00:00:00.000Z"),
  });
  const rendererEntry = join(__dirname, "../renderer/index.html");
  const securityPolicy = createDesktopRendererSecurityPolicy({
    rendererEntry,
  });
  const dispose = registerAuthIpcHandlers(securityPolicy, manager);
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await window.loadFile(rendererEntry);
    const result = await window.webContents.executeJavaScript(
      `
        (async () => {
          const bridge = window.quantDesktop?.auth;
          if (!bridge) return { ok: false, reason: "missing-auth-bridge" };
          await bridge.bootstrap();
          const login = await bridge.login({
            email: "smoke@example.test",
            password: "Smoke#2026"
          });
          const redemption = await bridge.redeemInvite({
            inviteCode: "QLD-ABCDE-FGHJK-MNPQR"
          });
          const snapshot = await bridge.getSnapshot();
          const rendererStorage = JSON.stringify(window.localStorage);
          return {
            ok: login.ok &&
              login.data.kind === "INVITE_REQUIRED" &&
              redemption.ok &&
              snapshot.ok &&
              snapshot.data.phase === "AUTHENTICATED_ONLINE" &&
              !rendererStorage.includes("qat_smoke") &&
              !rendererStorage.includes("qrt_smoke"),
            snapshot
          };
        })()
      `,
      true,
    );
    const persistedSafe =
      Boolean(persistedValue) &&
      !persistedValue!.includes("qat_smoke-access-token") &&
      !persistedValue!.includes("qrt_smoke-refresh-token");
    const ok = Boolean(result?.ok) && persistedSafe;
    console.log(JSON.stringify({ ok, phase: result?.snapshot?.data?.phase }));
    app.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    dispose();
    window.destroy();
  }
});
