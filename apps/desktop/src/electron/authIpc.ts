import { BrowserWindow, ipcMain } from "electron";

import type {
  AuthOperationResult,
  AuthStateSnapshot,
} from "../../../../packages/shared/src/auth.ts";

import type { AuthSessionManager } from "./authSessionManager.ts";
import { authIpcChannels } from "./authIpcContract.ts";
import {
  assertEmailInput,
  assertInviteInput,
  assertLoginInput,
  assertRegisterInput,
  assertResetPasswordInput,
} from "./authIpcValidation.ts";
import {
  assertTrustedIpcSender,
  isTrustedRendererUrl,
  type DesktopRendererSecurityPolicy,
} from "./electronSecurity.ts";

function invalidIpcResult(): AuthOperationResult<never> {
  return {
    ok: false,
    error: {
      code: "ACCESS_DENIED",
      message: "Authentication request was rejected",
    },
  };
}

async function handleValidated<T>(
  operation: () => Promise<AuthOperationResult<T>>,
): Promise<AuthOperationResult<T>> {
  try {
    return await operation();
  } catch {
    return invalidIpcResult();
  }
}

export function registerAuthIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  manager: AuthSessionManager,
): () => void {
  ipcMain.handle(authIpcChannels.bootstrap, (event) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      return manager.bootstrap();
    }),
  );
  ipcMain.handle(authIpcChannels.requestRegistrationCode, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertEmailInput(value);
      return manager.requestRegistrationCode(value);
    }),
  );
  ipcMain.handle(authIpcChannels.register, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertRegisterInput(value);
      return manager.register(value);
    }),
  );
  ipcMain.handle(authIpcChannels.login, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertLoginInput(value);
      return manager.login(value);
    }),
  );
  ipcMain.handle(authIpcChannels.redeemInvite, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertInviteInput(value);
      return manager.redeemInvite(value);
    }),
  );
  ipcMain.handle(authIpcChannels.renewEntitlement, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertInviteInput(value);
      return manager.renewEntitlement(value);
    }),
  );
  ipcMain.handle(authIpcChannels.requestPasswordReset, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertEmailInput(value);
      return manager.requestPasswordReset(value);
    }),
  );
  ipcMain.handle(authIpcChannels.resetPassword, (event, value) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      assertResetPasswordInput(value);
      return manager.resetPassword(value);
    }),
  );
  ipcMain.handle(authIpcChannels.logout, (event) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      return manager.logout();
    }),
  );
  ipcMain.handle(authIpcChannels.getSnapshot, (event) =>
    handleValidated(() => {
      assertTrustedIpcSender(event, securityPolicy);
      return manager.getSnapshot();
    }),
  );

  const handleRevalidate = (event: Electron.IpcMainEvent) => {
    try {
      assertTrustedIpcSender(event, securityPolicy);
      void manager.revalidate();
    } catch {
      // Untrusted lifecycle signals are deliberately ignored.
    }
  };
  ipcMain.on(authIpcChannels.revalidate, handleRevalidate);

  const unsubscribe = manager.subscribe((state: AuthStateSnapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (isTrustedRendererUrl(window.webContents.getURL(), securityPolicy)) {
        window.webContents.send(authIpcChannels.stateChanged, state);
      }
    }
  });

  return () => {
    unsubscribe();
    ipcMain.removeListener(authIpcChannels.revalidate, handleRevalidate);
    for (const channel of Object.values(authIpcChannels)) {
      if (channel !== authIpcChannels.stateChanged) {
        ipcMain.removeHandler(channel);
      }
    }
  };
}
