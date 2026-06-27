export interface DesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
}

export const desktopBridge: DesktopBridge = {
  platform: "desktop",
  version: "0.1.0",
};
