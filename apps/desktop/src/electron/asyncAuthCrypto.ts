import type { AuthTokenCrypto } from "./authTokenStore.ts";

export interface AsyncSafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string }>;
}

// Electron's async implementation moves Keychain work off the main thread.
// An async JS wrapper around decryptString() does NOT provide this isolation.
export function createAsyncAuthCrypto(storage: AsyncSafeStorage): AuthTokenCrypto {
  return {
    isEncryptionAvailable: () => storage.isAsyncEncryptionAvailable(),
    encrypt: async (value) => (await storage.encryptStringAsync(value)).toString("base64"),
    decrypt: async (value) =>
      (await storage.decryptStringAsync(Buffer.from(value, "base64"))).result,
  };
}
