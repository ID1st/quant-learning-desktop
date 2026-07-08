import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readMarketDataProviderSettings,
  writeMarketDataProviderSettings,
} from "../src/features/marketData/marketDataProviderSettings.ts";
import { createMemoryStorageDriver, LocalDatabase } from "../src/features/persistence/localDatabase.ts";

describe("market data provider settings", () => {
  it("keeps stock-sdk primary enabled by default", () => {
    const database = new LocalDatabase(createMemoryStorageDriver(), "test");

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: true,
    });
  });

  it("persists the guarded stock-sdk primary switch", () => {
    const database = new LocalDatabase(createMemoryStorageDriver(), "test");

    writeMarketDataProviderSettings({ stockSdkPrimaryEnabled: false }, database);

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: false,
    });
  });

  it("sanitizes malformed settings back to the open default", () => {
    const database = new LocalDatabase(
      createMemoryStorageDriver({
        "test.market-data-provider-settings": JSON.stringify({
          version: 2,
          data: { stockSdkPrimaryEnabled: "true" },
        }),
      }),
      "test",
    );

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: true,
    });
  });
});
