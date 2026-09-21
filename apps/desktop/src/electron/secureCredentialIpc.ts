import { app, ipcMain, safeStorage } from "electron";
import { join } from "node:path";
import type { AlphaFeedApiCredentials, LongPortApiCredentials } from "@quant/api-client";
import {
  createJsonFilePersistenceStore,
  createNodeJsonFilePersistenceDriver,
} from "./localPersistence";
import {
  createSecureCredentialStore,
  type AlphaFeedStreamCredentials,
} from "./secureCredentialStore";
import { createAsyncAuthCrypto } from "./asyncAuthCrypto.ts";
import {
  assertAlphaFeedCredentials,
  assertAlphaFeedStreamCredentials,
  assertLongPortCredentials,
  assertTrustedIpcSender,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity.ts";

type SecureCredentialInvokeResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

function toSafeCredentialError(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "安全凭据操作失败。";
}

export function createMainSecureCredentialStore() {
  return createSecureCredentialStore(
    createJsonFilePersistenceStore(
      createNodeJsonFilePersistenceDriver(join(app.getPath("userData"), "secure-credentials.json")),
    ),
    createAsyncAuthCrypto(safeStorage),
  );
}

export function registerSecureCredentialIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  credentialStore = createMainSecureCredentialStore(),
) {
  ipcMain.handle(
    "secureCredentials:saveAlphaFeed",
    async (event, credentials: unknown): Promise<SecureCredentialInvokeResult<null>> => {
      try {
        assertTrustedIpcSender(event, securityPolicy);
        assertAlphaFeedCredentials(credentials);
        await credentialStore.saveAlphaFeedCredentials(
          credentials as unknown as AlphaFeedApiCredentials,
        );
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle(
    "secureCredentials:clearAlphaFeed",
    (event): SecureCredentialInvokeResult<null> => {
      try {
        assertTrustedIpcSender(event, securityPolicy);
        credentialStore.clearAlphaFeedCredentials();
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle(
    "secureCredentials:saveAlphaFeedStream",
    async (event, credentials: unknown): Promise<SecureCredentialInvokeResult<null>> => {
      try {
        assertTrustedIpcSender(event, securityPolicy);
        assertAlphaFeedStreamCredentials(credentials);
        await credentialStore.saveAlphaFeedStreamCredentials(
          credentials as unknown as AlphaFeedStreamCredentials,
        );
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle(
    "secureCredentials:clearAlphaFeedStream",
    (event): SecureCredentialInvokeResult<null> => {
      try {
        assertTrustedIpcSender(event, securityPolicy);
        credentialStore.clearAlphaFeedStreamCredentials();
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle(
    "secureCredentials:saveLongPort",
    async (event, credentials: unknown): Promise<SecureCredentialInvokeResult<null>> => {
      try {
        assertTrustedIpcSender(event, securityPolicy);
        assertLongPortCredentials(credentials);
        await credentialStore.saveLongPortCredentials(
          credentials as unknown as LongPortApiCredentials,
        );
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle("secureCredentials:clearLongPort", (event): SecureCredentialInvokeResult<null> => {
    try {
      assertTrustedIpcSender(event, securityPolicy);
      credentialStore.clearLongPortCredentials();
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });
}
