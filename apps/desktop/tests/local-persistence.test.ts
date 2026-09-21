import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDesktopBridgeFromPersistenceStore,
  createJsonFilePersistenceStore,
  createMemoryPersistenceStore,
  createNodeJsonFilePersistenceDriver,
  type JsonFilePersistenceDriver,
} from "../src/electron/localPersistence.ts";

test("atomic file writes preserve old data when writing or replacement fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "quant-persistence-"));
  const path = join(directory, "credentials.json");
  try {
    const driver = createNodeJsonFilePersistenceDriver(path);
    driver.writeText("old");
    for (const operations of [
      {
        writeFileSync: (() => {
          throw new Error("disk full");
        }) as typeof writeFileSync,
        renameSync,
      },
      {
        writeFileSync,
        renameSync: (() => {
          throw new Error("replace failed");
        }) as typeof renameSync,
      },
    ]) {
      assert.throws(() => createNodeJsonFilePersistenceDriver(path, operations).writeText("new"));
      assert.equal(readFileSync(path, "utf8"), "old");
      assert.deepEqual(readdirSync(directory), ["credentials.json"]);
    }
    driver.writeText("new");
    assert.equal(driver.readText(), "new");
    driver.remove();
    assert.equal(driver.readText(), null);
    driver.remove();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createMemoryJsonDriver(
  initialValue: string | null = null,
): JsonFilePersistenceDriver & { currentValue(): string | null } {
  let value = initialValue;

  return {
    readText: () => value,
    writeText: (nextValue) => {
      value = nextValue;
    },
    remove: () => {
      value = null;
    },
    currentValue: () => value,
  };
}

test("JSON file persistence store writes and reads string values", () => {
  const driver = createMemoryJsonDriver();
  const store = createJsonFilePersistenceStore(driver);

  store.setItem("quant-learning.sample", "alpha");

  assert.equal(store.getItem("quant-learning.sample"), "alpha");
  assert.equal(JSON.parse(driver.currentValue() ?? "{}")["quant-learning.sample"], "alpha");
});

test("JSON file persistence store removes the backing file when empty", () => {
  const driver = createMemoryJsonDriver();
  const store = createJsonFilePersistenceStore(driver);

  store.setItem("quant-learning.sample", "alpha");
  store.removeItem("quant-learning.sample");

  assert.equal(store.getItem("quant-learning.sample"), null);
  assert.equal(driver.currentValue(), null);
});

test("JSON file persistence store preserves malformed stored JSON", () => {
  const driver = createMemoryJsonDriver("{bad json");
  const store = createJsonFilePersistenceStore(driver);

  assert.throws(() => store.getItem("quant-learning.sample"), /损坏/);
  assert.throws(() => store.setItem("quant-learning.sample", "alpha"), /损坏/);
  assert.equal(driver.currentValue(), "{bad json");
});

test("missing inherited keys return null and malformed record shapes cannot be replaced", () => {
  const store = createJsonFilePersistenceStore(createMemoryJsonDriver());
  assert.equal(store.getItem("toString"), null);
  assert.equal(store.getItem("__proto__"), null);
  for (const value of ["[]", "null", "42", '{"key":42}']) {
    const driver = createMemoryJsonDriver(value);
    assert.throws(() => createJsonFilePersistenceStore(driver).setItem("new", "value"), /损坏/);
    assert.equal(driver.currentValue(), value);
  }
});

test("local persistence rejects unsafe keys and oversized values", () => {
  const store = createMemoryPersistenceStore();

  assert.throws(() => store.setItem("../secret", "alpha"), /键名无效/);
  assert.throws(
    () => store.setItem("quant-learning.sample", "x".repeat(5 * 1024 * 1024 + 1)),
    /数据过大/,
  );
});

test("desktop bridge delegates to the persistence store", () => {
  const store = createMemoryPersistenceStore();
  const bridge = createDesktopBridgeFromPersistenceStore(store);

  bridge.setItem("quant-learning.sample", "alpha");
  assert.equal(bridge.getItem("quant-learning.sample"), "alpha");

  bridge.removeItem("quant-learning.sample");
  assert.equal(bridge.getItem("quant-learning.sample"), null);
});
