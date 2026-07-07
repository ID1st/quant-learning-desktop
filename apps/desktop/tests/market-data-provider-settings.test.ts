import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  readMarketDataProviderSettings,
  writeMarketDataProviderSettings,
} from "../src/features/marketData/marketDataProviderSettings.ts";
import { createMemoryStorageDriver, LocalDatabase } from "../src/features/persistence/localDatabase.ts";

describe("market data provider settings", () => {
  it("keeps stock-sdk primary disabled by default", () => {
    const database = new LocalDatabase(createMemoryStorageDriver(), "test");

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: false,
    });
  });

  it("persists the guarded stock-sdk primary switch", () => {
    const database = new LocalDatabase(createMemoryStorageDriver(), "test");

    writeMarketDataProviderSettings({ stockSdkPrimaryEnabled: true }, database);

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: true,
    });
  });

  it("sanitizes malformed settings back to a closed switch", () => {
    const database = new LocalDatabase(
      createMemoryStorageDriver({
        "test.market-data-provider-settings": JSON.stringify({
          version: 1,
          data: { stockSdkPrimaryEnabled: "true" },
        }),
      }),
      "test",
    );

    assert.deepEqual(readMarketDataProviderSettings(database), {
      stockSdkPrimaryEnabled: false,
    });
  });
});
