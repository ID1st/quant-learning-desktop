import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";

const MAX_STORAGE_KEY_LENGTH = 180;
const MAX_STORAGE_VALUE_LENGTH = 5 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

export interface LocalPersistenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface JsonFilePersistenceDriver {
  readText(): string | null;
  writeText(value: string): void;
  remove(): void;
}

function ensureStorageKey(key: string) {
  if (!key || key.length > MAX_STORAGE_KEY_LENGTH || !STORAGE_KEY_PATTERN.test(key)) {
    throw new Error("本地持久化键名无效。");
  }
}

function ensureStorageValue(value: string) {
  if (value.length > MAX_STORAGE_VALUE_LENGTH) {
    throw new Error("本地持久化数据过大。");
  }
}

function sanitizeRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, string>>((record, [key, item]) => {
    if (typeof item === "string") {
      record[key] = item;
    }

    return record;
  }, {});
}

export function createMemoryPersistenceStore(
  seed: Record<string, string> = {},
): LocalPersistenceStore {
  const store = new Map(Object.entries(sanitizeRecord(seed)));

  return {
    getItem: (key) => {
      ensureStorageKey(key);
      return store.get(key) ?? null;
    },
    setItem: (key, value) => {
      ensureStorageKey(key);
      ensureStorageValue(value);
      store.set(key, value);
    },
    removeItem: (key) => {
      ensureStorageKey(key);
      store.delete(key);
    },
  };
}

export function createJsonFilePersistenceStore(
  driver: JsonFilePersistenceDriver,
): LocalPersistenceStore {
  const readStore = () => {
    const rawValue = driver.readText();
    if (!rawValue) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((value) => typeof value === "string")
      ) {
        throw new Error("invalid record");
      }
      return parsed as Record<string, string>;
    } catch {
      throw new Error("本地持久化文件损坏，已保留原文件，请恢复备份后重试。");
    }
  };

  const writeStore = (store: Record<string, string>) => {
    if (Object.keys(store).length === 0) {
      driver.remove();
      return;
    }

    driver.writeText(JSON.stringify(store));
  };

  return {
    getItem: (key) => {
      ensureStorageKey(key);
      const store = readStore();
      return Object.hasOwn(store, key) ? store[key] : null;
    },
    setItem: (key, value) => {
      ensureStorageKey(key);
      ensureStorageValue(value);
      writeStore({ ...readStore(), [key]: value });
    },
    removeItem: (key) => {
      ensureStorageKey(key);
      const store = readStore();
      delete store[key];
      writeStore(store);
    },
  };
}

export function createNodeJsonFilePersistenceDriver(
  filePath: string,
  operations = { writeFileSync, renameSync },
): JsonFilePersistenceDriver {
  return {
    readText: () => {
      if (!existsSync(filePath)) {
        return null;
      }

      return readFileSync(filePath, "utf8");
    },
    writeText: (value) => {
      mkdirSync(dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
      try {
        operations.writeFileSync(temporaryPath, value, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
          flush: true,
        });
        operations.renameSync(temporaryPath, filePath);
      } finally {
        rmSync(temporaryPath, { force: true });
      }
    },
    remove: () => {
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    },
  };
}

export function createDesktopBridgeFromPersistenceStore(
  store: LocalPersistenceStore,
): LocalPersistenceStore {
  return {
    getItem: (key) => store.getItem(key),
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
  };
}
