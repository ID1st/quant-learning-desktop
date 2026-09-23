export interface LocalDatabaseDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DesktopLocalDatabaseBridge {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalDatabaseDocument<T> {
  version: number;
  data: T;
  updatedAt: string;
}

export interface LocalDatabaseReadOptions<T> {
  version: number;
  fallback: T;
  sanitize: (value: unknown) => T | null;
}

function isLocalDatabaseDocument(value: unknown): value is LocalDatabaseDocument<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const document = value as Partial<LocalDatabaseDocument<unknown>>;
  return (
    typeof document.version === "number" &&
    "data" in document &&
    typeof document.updatedAt === "string"
  );
}

export function createBrowserStorageDriver(): LocalDatabaseDriver {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
}

export function createDesktopBridgeStorageDriver(
  bridge: DesktopLocalDatabaseBridge,
): LocalDatabaseDriver {
  return {
    getItem: (key) => bridge.getItem(key),
    setItem: (key, value) => bridge.setItem(key, value),
    removeItem: (key) => bridge.removeItem(key),
  };
}

export function createMemoryStorageDriver(seed: Record<string, string> = {}): LocalDatabaseDriver {
  const store = new Map(Object.entries(seed));

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

export class LocalDatabase {
  private readonly driver: LocalDatabaseDriver;
  private readonly namespace: string;

  constructor(driver: LocalDatabaseDriver, namespace = "quant-learning") {
    this.driver = driver;
    this.namespace = namespace;
  }

  readDocument<T>(collection: string, options: LocalDatabaseReadOptions<T>): T {
    try {
      const rawValue = this.driver.getItem(this.createKey(collection));
      if (!rawValue) {
        return options.fallback;
      }

      const parsedValue = JSON.parse(rawValue) as unknown;
      const versioned = isLocalDatabaseDocument(parsedValue);
      if (versioned && parsedValue.version > options.version) {
        return options.fallback;
      }
      const candidate = isLocalDatabaseDocument(parsedValue) ? parsedValue.data : parsedValue;
      const sanitized = options.sanitize(candidate);

      if (!sanitized) {
        return options.fallback;
      }

      if (!versioned || parsedValue.version !== options.version) {
        try {
          this.writeDocument(collection, options.version, sanitized);
        } catch {
          console.warn(
            "Local document migration could not be persisted; readable data was retained.",
          );
        }
      }
      return sanitized;
    } catch {
      return options.fallback;
    }
  }

  writeDocument<T>(collection: string, version: number, data: T): void {
    const document: LocalDatabaseDocument<T> = {
      version,
      data,
      updatedAt: new Date().toISOString(),
    };

    this.driver.setItem(this.createKey(collection), JSON.stringify(document));
  }

  removeDocument(collection: string): void {
    this.driver.removeItem(this.createKey(collection));
  }

  private createKey(collection: string) {
    return `${this.namespace}.${collection}`;
  }
}

function getDesktopLocalDatabaseBridge(): DesktopLocalDatabaseBridge | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = window.quantDesktop?.localDatabase;

  if (
    candidate &&
    typeof candidate.getItem === "function" &&
    typeof candidate.setItem === "function" &&
    typeof candidate.removeItem === "function"
  ) {
    return candidate;
  }

  return null;
}

export function createAppLocalDatabase() {
  if (typeof window === "undefined") {
    return new LocalDatabase(createMemoryStorageDriver());
  }

  const desktopBridge = getDesktopLocalDatabaseBridge();
  return new LocalDatabase(
    desktopBridge ? createDesktopBridgeStorageDriver(desktopBridge) : createBrowserStorageDriver(),
  );
}

export const appLocalDatabase = createAppLocalDatabase();
