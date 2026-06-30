export interface DesktopBridge {
  readonly platform: "desktop";
  readonly version: string;
  readonly localDatabase: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
}

const preloadLocalDatabaseStore = new Map<string, string>();

export const desktopBridge: DesktopBridge = {
  platform: "desktop",
  version: "0.1.0",
  localDatabase: {
    getItem: (key) => preloadLocalDatabaseStore.get(key) ?? null,
    setItem: (key, value) => {
      preloadLocalDatabaseStore.set(key, value);
    },
    removeItem: (key) => {
      preloadLocalDatabaseStore.delete(key);
    },
  },
};
