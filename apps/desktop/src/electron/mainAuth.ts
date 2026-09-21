import { app, safeStorage } from "electron";
import { hostname } from "node:os";
import { join } from "node:path";

import { createCloudAuthClient } from "../../../../packages/api-client/src/auth.ts";

import { resolveAuthBaseUrl } from "./authRuntimeConfig.ts";
import { createAuthSessionManager } from "./authSessionManager.ts";
import {
  createAuthTokenStore,
  createFileAuthPersistence,
  type AuthTokenCrypto,
} from "./authTokenStore.ts";
import { createAsyncAuthCrypto } from "./asyncAuthCrypto.ts";
import { readOrCreateDeviceId } from "./deviceIdentity.ts";

declare const __QUANT_AUTH_BASE_URL__: string;
declare const __QUANT_AUTH_OFFLINE_PUBLIC_KEY_PEM__: string;

export async function createMainAuthSessionManager(
  options: { tokenCrypto?: AuthTokenCrypto } = {},
) {
  const userDataDirectory = app.getPath("userData");
  const deviceId = await readOrCreateDeviceId(join(userDataDirectory, "auth-device.json"));
  const tokenStore = createAuthTokenStore(
    createFileAuthPersistence(join(userDataDirectory, "auth-session.enc")),
    options.tokenCrypto ?? createAsyncAuthCrypto(safeStorage),
  );
  const baseUrl = resolveAuthBaseUrl(__QUANT_AUTH_BASE_URL__, app.isPackaged);
  const offlinePublicKeyPem =
    __QUANT_AUTH_OFFLINE_PUBLIC_KEY_PEM__ || "OFFLINE_VERIFICATION_KEY_NOT_CONFIGURED";

  return createAuthSessionManager({
    client: createCloudAuthClient({ baseUrl }),
    tokenStore,
    device: {
      deviceId,
      deviceLabel: `${hostname()} (${process.platform})`,
    },
    offlinePublicKeyPem,
  });
}
