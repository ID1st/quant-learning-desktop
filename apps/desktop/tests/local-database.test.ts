import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAppLocalDatabase,
  createMemoryStorageDriver,
  LocalDatabase,
  type DesktopLocalDatabaseBridge,
} from "../src/features/persistence/localDatabase.ts";

interface SampleDocument {
  id: string;
  count: number;
}

test("current documents are readable when storage is read-only", () => {
  let writes = 0;
  const database = new LocalDatabase({
    getItem: () =>
      JSON.stringify({ version: 1, data: { id: "saved", count: 2 }, updatedAt: "2026-09-21" }),
    setItem: () => {
      writes++;
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  });
  assert.deepEqual(
    database.readDocument("sample", {
      version: 1,
      fallback: null,
      sanitize: sanitizeSampleDocument,
    }),
    { id: "saved", count: 2 },
  );
  assert.equal(writes, 0);
});

test("failed legacy migration preserves readable data and future versions are not overwritten", () => {
  let raw = JSON.stringify({ id: "legacy", count: 3 });
  let writes = 0;
  const database = new LocalDatabase({
    getItem: () => raw,
    setItem: () => {
      writes++;
      throw new Error("read-only");
    },
    removeItem: () => {},
  });
  assert.deepEqual(
    database.readDocument("sample", {
      version: 1,
      fallback: null,
      sanitize: sanitizeSampleDocument,
    }),
    { id: "legacy", count: 3 },
  );
  assert.equal(writes, 1);
  raw = JSON.stringify({ version: 2, data: { id: "future", count: 3 }, updatedAt: "2026-09-21" });
  assert.equal(
    database.readDocument("sample", {
      version: 1,
      fallback: null,
      sanitize: sanitizeSampleDocument,
    }),
    null,
  );
  assert.equal(writes, 1);
});

function sanitizeSampleDocument(value: unknown): SampleDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const document = value as Partial<SampleDocument>;
  if (typeof document.id !== "string" || typeof document.count !== "number") {
    return null;
  }

  return {
    id: document.id,
    count: document.count,
  };
}

test("LocalDatabase reads legacy raw JSON and rewrites a versioned document", () => {
  const driver = createMemoryStorageDriver({
    "test.sample": JSON.stringify({ id: "alpha", count: 2 }),
  });
  const database = new LocalDatabase(driver, "test");

  const document = database.readDocument("sample", {
    version: 1,
    fallback: { id: "fallback", count: 0 },
    sanitize: sanitizeSampleDocument,
  });

  assert.deepEqual(document, { id: "alpha", count: 2 });

  const stored = JSON.parse(driver.getItem("test.sample") ?? "{}") as {
    version?: number;
    data?: SampleDocument;
  };
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.data, { id: "alpha", count: 2 });
});

test("LocalDatabase falls back when stored data fails validation", () => {
  const driver = createMemoryStorageDriver({
    "test.sample": JSON.stringify({ id: "alpha", count: "bad" }),
  });
  const database = new LocalDatabase(driver, "test");

  const document = database.readDocument("sample", {
    version: 1,
    fallback: { id: "fallback", count: 0 },
    sanitize: sanitizeSampleDocument,
  });

  assert.deepEqual(document, { id: "fallback", count: 0 });
});

test("LocalDatabase removes documents by collection", () => {
  const driver = createMemoryStorageDriver();
  const database = new LocalDatabase(driver, "test");

  database.writeDocument("sample", 1, { id: "alpha", count: 2 });
  assert.notEqual(driver.getItem("test.sample"), null);

  database.removeDocument("sample");
  assert.equal(driver.getItem("test.sample"), null);
});

test("createAppLocalDatabase prefers the desktop bridge when available", () => {
  const bridgeSeed: Record<string, string> = {};
  const bridge: DesktopLocalDatabaseBridge = {
    getItem: (key) => bridgeSeed[key] ?? null,
    setItem: (key, value) => {
      bridgeSeed[key] = value;
    },
    removeItem: (key) => {
      delete bridgeSeed[key];
    },
  };
  const previousWindow = globalThis.window;

  globalThis.window = {
    quantDesktop: {
      platform: "desktop",
      version: "0.1.0",
      localDatabase: bridge,
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {
        throw new Error("browser storage should not be used");
      },
      removeItem: () => {},
    },
  } as unknown as Window & typeof globalThis;

  try {
    const database = createAppLocalDatabase();
    database.writeDocument("sample", 1, { id: "desktop", count: 3 });

    assert.match(bridgeSeed["quant-learning.sample"], /desktop/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("createAppLocalDatabase falls back to browser storage without a desktop bridge", () => {
  const browserSeed: Record<string, string> = {};
  const previousWindow = globalThis.window;

  globalThis.window = {
    localStorage: {
      getItem: (key: string) => browserSeed[key] ?? null,
      setItem: (key: string, value: string) => {
        browserSeed[key] = value;
      },
      removeItem: (key: string) => {
        delete browserSeed[key];
      },
    },
  } as unknown as Window & typeof globalThis;

  try {
    const database = createAppLocalDatabase();
    database.writeDocument("sample", 1, { id: "browser", count: 4 });

    assert.match(browserSeed["quant-learning.sample"], /browser/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("desktop renderer data persists through browser storage when no database bridge is exposed", () => {
  const browserSeed: Record<string, string> = {};
  const previousWindow = globalThis.window;

  globalThis.window = {
    quantDesktop: {
      platform: "desktop",
      version: "0.1.0",
    },
    localStorage: {
      getItem: (key: string) => browserSeed[key] ?? null,
      setItem: (key: string, value: string) => {
        browserSeed[key] = value;
      },
      removeItem: (key: string) => {
        delete browserSeed[key];
      },
    },
  } as unknown as Window & typeof globalThis;

  try {
    createAppLocalDatabase().writeDocument("sample", 1, { id: "desktop-persistent", count: 5 });
    const restored = createAppLocalDatabase().readDocument("sample", {
      version: 1,
      fallback: { id: "fallback", count: 0 },
      sanitize: sanitizeSampleDocument,
    });

    assert.deepEqual(restored, { id: "desktop-persistent", count: 5 });
  } finally {
    globalThis.window = previousWindow;
  }
});
