/// <reference types="vite/client" />

interface QuantDesktopLocalDatabaseBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface QuantDesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase?: QuantDesktopLocalDatabaseBridge;
}

interface Window {
  readonly quantDesktop?: QuantDesktopBridge;
}
