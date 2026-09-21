import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface AuthEncryptedPersistence {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}

export interface AuthTokenCrypto {
  isEncryptionAvailable(): boolean | Promise<boolean>;
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export interface AuthTokenMaterial {
  accessToken: string;
  refreshToken: string;
  offlineLease: string;
  deviceId: string;
  lastServerTime: string;
}

export type PersistedAuthTokenMaterial = Omit<AuthTokenMaterial, "accessToken">;

export interface AuthTokenStore {
  save(material: AuthTokenMaterial): Promise<void>;
  restore(): Promise<PersistedAuthTokenMaterial | null>;
  getAccessToken(): string | null;
  clear(): Promise<void>;
}

interface PersistedEnvelope {
  version: 1;
  encryptedPayload: string;
}

function isPersistedMaterial(value: unknown): value is PersistedAuthTokenMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expectedKeys = ["deviceId", "lastServerTime", "offlineLease", "refreshToken"].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    typeof record.refreshToken === "string" &&
    record.refreshToken.length >= 16 &&
    typeof record.offlineLease === "string" &&
    record.offlineLease.length >= 16 &&
    typeof record.deviceId === "string" &&
    record.deviceId.length >= 8 &&
    typeof record.lastServerTime === "string" &&
    Number.isFinite(Date.parse(record.lastServerTime))
  );
}

export function createAuthTokenStore(
  persistence: AuthEncryptedPersistence,
  crypto: AuthTokenCrypto,
  options: { restoreTimeoutMilliseconds?: number; allowMemoryOnlySession?: boolean } = {},
): AuthTokenStore {
  let accessToken: string | null = null;
  const restoreTimeoutMilliseconds = options.restoreTimeoutMilliseconds ?? 5_000;

  const withDeadline = async <T>(operation: () => Promise<T>) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("secure authentication operation timed out")),
        restoreTimeoutMilliseconds,
      );
    });
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  return {
    save: async (material) => {
      const persisted: PersistedAuthTokenMaterial = {
        refreshToken: material.refreshToken,
        offlineLease: material.offlineLease,
        deviceId: material.deviceId,
        lastServerTime: material.lastServerTime,
      };
      try {
        const encryptedPayload = await withDeadline(async () => {
          if (!(await crypto.isEncryptionAvailable())) {
            throw new Error("Secure token encryption is unavailable");
          }
          return crypto.encrypt(JSON.stringify(persisted));
        });
        const envelope: PersistedEnvelope = {
          version: 1,
          encryptedPayload,
        };
        await persistence.write(JSON.stringify(envelope));
        accessToken = material.accessToken;
      } catch (error) {
        if (!options.allowMemoryOnlySession) {
          throw error;
        }
        await persistence.remove().catch(() => undefined);
        accessToken = material.accessToken;
      }
    },
    restore: async () => {
      try {
        const rawValue = await persistence.read();
        if (!rawValue) {
          return null;
        }
        const envelope = JSON.parse(rawValue) as Partial<PersistedEnvelope>;
        if (envelope.version !== 1 || typeof envelope.encryptedPayload !== "string") {
          throw new Error("stored authentication envelope is invalid");
        }
        const plaintext = await withDeadline(() => crypto.decrypt(envelope.encryptedPayload!));
        const material: unknown = JSON.parse(plaintext);
        if (!isPersistedMaterial(material)) {
          throw new Error("stored authentication material is invalid");
        }
        return material;
      } catch {
        accessToken = null;
        await persistence.remove().catch(() => undefined);
        return null;
      }
    },
    getAccessToken: () => accessToken,
    clear: async () => {
      accessToken = null;
      await persistence.remove();
    },
  };
}

export function createFileAuthPersistence(filePath: string): AuthEncryptedPersistence {
  const temporaryPath = `${filePath}.tmp`;
  return {
    read: async () =>
      readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      }),
    write: async (value) => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(temporaryPath, value, {
        encoding: "utf8",
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, filePath);
      await chmod(filePath, 0o600);
    },
    remove: async () => {
      await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") {
          throw error;
        }
      });
      await unlink(temporaryPath).catch(() => undefined);
    },
  };
}
