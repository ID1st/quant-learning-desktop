import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAppRuntimeError,
  createAppRuntimeErrorRecord,
} from "../src/features/feedback/appRuntimeErrorStore.ts";

test("runtime error records redact credential-like values before UI reporting", () => {
  const record = createAppRuntimeErrorRecord(
    "window-error",
    new Error("request failed: https://example.test?api_key=secret-value&symbol=AAPL"),
    "2026-07-13T08:00:00.000Z",
  );

  assert.equal(record.scope, "window-error");
  assert.match(record.message, /api_key=\[已隐藏\]/u);
  assert.doesNotMatch(record.message, /secret-value/u);
});

test("runtime error records dedupe immediate repeats and keep the newest entries", () => {
  const first = createAppRuntimeErrorRecord("render", new Error("render failed"), "2026-07-13T08:00:00.000Z");
  const duplicate = createAppRuntimeErrorRecord("render", new Error("render failed"), "2026-07-13T08:00:03.000Z");
  const next = createAppRuntimeErrorRecord("unhandled-rejection", new Error("request failed"), "2026-07-13T08:00:10.000Z");

  const deduped = appendAppRuntimeError([first], duplicate);
  assert.equal(deduped.length, 1);
  assert.deepEqual(appendAppRuntimeError(deduped, next).map((item) => item.scope), ["unhandled-rejection", "render"]);
});
