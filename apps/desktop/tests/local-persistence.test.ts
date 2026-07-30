import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDesktopBridgeFromPersistenceStore,
  createJsonFilePersistenceStore,
  createMemoryPersistenceStore,
  type JsonFilePersistenceDriver,
} from "../src/electron/localPersistence.ts";

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

test("JSON file persistence store ignores malformed stored JSON", () => {
  const driver = createMemoryJsonDriver("{bad json");
  const store = createJsonFilePersistenceStore(driver);

  assert.equal(store.getItem("quant-learning.sample"), null);

  store.setItem("quant-learning.sample", "alpha");
  assert.equal(store.getItem("quant-learning.sample"), "alpha");
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
