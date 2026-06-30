import { createDesktopBridgeFromPersistenceStore, createMemoryPersistenceStore } from "./localPersistence";

export interface DesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

const preloadLocalDatabaseStore = createMemoryPersistenceStore();

export const desktopBridge: DesktopBridge = {
  platform: "desktop",
  version: "0.1.0",
  localDatabase: createDesktopBridgeFromPersistenceStore(preloadLocalDatabaseStore),
};
