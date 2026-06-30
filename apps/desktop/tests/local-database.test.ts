import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryStorageDriver, LocalDatabase } from "../src/features/persistence/localDatabase.ts";

interface SampleDocument {
  id: string;
  count: number;
}

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

  const stored = JSON.parse(driver.getItem("test.sample") ?? "{}") as { version?: number; data?: SampleDocument };
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
