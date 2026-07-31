import { ipcMain } from "electron";

import { diagnosticsIpcChannels, type DiagnosticsIpcHandlers } from "./diagnosticsIpcContract.ts";
import { assertTrustedIpcSender, type DesktopRendererSecurityPolicy } from "./electronSecurity.ts";

export function registerDiagnosticsIpcHandlers(
  securityPolicy: DesktopRendererSecurityPolicy,
  handlers: DiagnosticsIpcHandlers,
) {
  ipcMain.handle(diagnosticsIpcChannels.exportPackage, (event) => {
    assertTrustedIpcSender(event, securityPolicy);
    return handlers.exportPackage();
  });

  return () => {
    ipcMain.removeHandler(diagnosticsIpcChannels.exportPackage);
  };
}
