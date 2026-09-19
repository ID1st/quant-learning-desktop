import assert from "node:assert/strict";
import test from "node:test";
import {
  isAlphaFeedInitialSyncFailureBlocking,
  isAlphaFeedRateLimitError,
} from "../src/features/api/alphaFeedInitialSyncPolicy.ts";

test("AlphaFeed rate limits defer initial sync instead of rejecting a saved binding", () => {
  const message = "AlphaFeed API 历史 K 线请求失败：AlphaFeed 请求频率超限，请稍后重试。";
  assert.equal(isAlphaFeedRateLimitError(message), true);
  assert.equal(isAlphaFeedInitialSyncFailureBlocking(message, "historical"), false);
});

test("AlphaFeed authentication and unexpected historical failures remain blocking", () => {
  assert.equal(isAlphaFeedInitialSyncFailureBlocking("HTTP 401 Unauthorized", "intraday"), true);
  assert.equal(isAlphaFeedInitialSyncFailureBlocking("upstream unavailable", "historical"), true);
  assert.equal(isAlphaFeedInitialSyncFailureBlocking("套餐无此功能或市场权限", "intraday"), false);
});
