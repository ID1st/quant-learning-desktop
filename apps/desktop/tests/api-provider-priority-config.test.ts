import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  apiProviderPriorityItems,
  formatApiProviderStatus,
  getApiProviderStatus,
} from "../src/features/api/apiProviderPriorityConfig.ts";

describe("api provider priority config", () => {
  it("keeps stock-sdk first and fallback providers after it", () => {
    assert.deepEqual(
      apiProviderPriorityItems.map((item) => item.id),
      ["stock-sdk", "alphafeed-rest", "alphafeed-websocket", "longbridge"],
    );
    assert.equal(apiProviderPriorityItems[0]?.role, "primary");
    assert.equal(apiProviderPriorityItems.slice(1).every((item) => item.role === "fallback"), true);
  });

  it("reports provider configuration status from stored bindings", () => {
    const state = {
      stockSdkPrimaryEnabled: false,
      alphaFeedRestBound: true,
      alphaFeedWebSocketPrepared: false,
      longBridgeBound: true,
    };

    assert.equal(getApiProviderStatus("stock-sdk", state), "placeholder");
    assert.equal(getApiProviderStatus("alphafeed-rest", state), "configured");
    assert.equal(getApiProviderStatus("alphafeed-websocket", state), "unconfigured");
    assert.equal(getApiProviderStatus("longbridge", state), "configured");
  });

  it("marks stock-sdk as enabled when the guarded primary switch is on", () => {
    assert.equal(
      getApiProviderStatus("stock-sdk", {
        stockSdkPrimaryEnabled: true,
        alphaFeedRestBound: false,
        alphaFeedWebSocketPrepared: false,
        longBridgeBound: false,
      }),
      "enabled",
    );
  });

  it("formats status labels in Chinese", () => {
    assert.equal(formatApiProviderStatus("placeholder"), "待接入");
    assert.equal(formatApiProviderStatus("enabled"), "已启用");
    assert.equal(formatApiProviderStatus("unconfigured"), "未配置");
    assert.equal(formatApiProviderStatus("configured"), "已配置");
    assert.equal(formatApiProviderStatus("prepared"), "已预留");
  });
});
