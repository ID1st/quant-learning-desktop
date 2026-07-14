import { app, ipcMain, safeStorage } from "electron";
import { join } from "node:path";
import type { AlphaFeedApiCredentials, LongPortApiCredentials } from "@quant/api-client";
import { createJsonFilePersistenceStore, createNodeJsonFilePersistenceDriver } from "./localPersistence";
import { createSecureCredentialStore, type AlphaFeedStreamCredentials } from "./secureCredentialStore";

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
    createJsonFilePersistenceStore(createNodeJsonFilePersistenceDriver(join(app.getPath("userData"), "secure-credentials.json"))),
    {
      encrypt: (value) => safeStorage.encryptString(value).toString("base64"),
      decrypt: (value) => safeStorage.decryptString(Buffer.from(value, "base64")),
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    },
  );
}

export function registerSecureCredentialIpcHandlers(credentialStore = createMainSecureCredentialStore()) {
  ipcMain.handle("secureCredentials:saveAlphaFeed", (_event, credentials: AlphaFeedApiCredentials): SecureCredentialInvokeResult<null> => {
    try {
      credentialStore.saveAlphaFeedCredentials(credentials);
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });

  ipcMain.handle("secureCredentials:clearAlphaFeed", (): SecureCredentialInvokeResult<null> => {
    try {
      credentialStore.clearAlphaFeedCredentials();
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });

  ipcMain.handle(
    "secureCredentials:saveAlphaFeedStream",
    (_event, credentials: AlphaFeedStreamCredentials): SecureCredentialInvokeResult<null> => {
      try {
        credentialStore.saveAlphaFeedStreamCredentials(credentials);
        return { ok: true, value: null };
      } catch (error) {
        return { ok: false, error: { message: toSafeCredentialError(error) } };
      }
    },
  );

  ipcMain.handle("secureCredentials:clearAlphaFeedStream", (): SecureCredentialInvokeResult<null> => {
    try {
      credentialStore.clearAlphaFeedStreamCredentials();
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });

  ipcMain.handle("secureCredentials:saveLongPort", (_event, credentials: LongPortApiCredentials): SecureCredentialInvokeResult<null> => {
    try {
      credentialStore.saveLongPortCredentials(credentials);
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });

  ipcMain.handle("secureCredentials:clearLongPort", (): SecureCredentialInvokeResult<null> => {
    try {
      credentialStore.clearLongPortCredentials();
      return { ok: true, value: null };
    } catch (error) {
      return { ok: false, error: { message: toSafeCredentialError(error) } };
    }
  });
}
