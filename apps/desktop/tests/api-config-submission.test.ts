import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { verifySelectedBackupProvider } from "../src/features/api/apiConfigSubmissionService.ts";

test("selecting LongBridge verifies LongBridge without requiring AlphaFeed credentials", async () => {
  const calls: string[] = [];

  const result = await verifySelectedBackupProvider(
    "longbridge",
    {
      alphaFeed: { apiUrl: "https://api.tickflow.org", apiKey: "" },
      longPort: {
        apiUrl: "https://openapi.longbridge.com",
        appKey: "longbridge-app-key",
        appSecret: "longbridge-app-secret",
        accessToken: "longbridge-access-token",
      },
    },
    {
      resolveAlphaFeedCredentials: async () => {
        calls.push("resolve-alphafeed");
        throw new Error("AlphaFeed should not be resolved");
      },
      verifyAlphaFeedApiConfig: async () => {
        calls.push("verify-alphafeed");
        throw new Error("AlphaFeed should not be verified");
      },
      verifyLongPortApiConfig: async () => {
        calls.push("verify-longbridge");
        return {
          apiUrl: "https://openapi.longbridge.com",
          appKeyPreview: "long****key",
          accessTokenPreview: "long****oken",
          markets: ["US", "HK", "CN"],
          verifiedAt: "2026-07-25T00:00:00.000Z",
          authMode: "legacy-api-key",
          activatedAt: "2026-07-25T00:00:00.000Z",
        };
      },
    },
  );

  assert.equal(result.provider, "longbridge");
  assert.deepEqual(calls, ["verify-longbridge"]);
});

test("LongBridge App Key is masked and never rendered in saved credential summaries", () => {
  const source = readFileSync(new URL("../src/pages/ApiConfigPage.tsx", import.meta.url), "utf8");
  const appKeyInput = source.match(
    /onChange=\{\(event\) => updateLongPortField\("appKey", event\.target\.value\)\}[\s\S]{0,200}?value=\{longPortForm\.appKey\}/u,
  );

  assert.ok(appKeyInput, "LongBridge App Key input must exist");
  assert.match(appKeyInput[0], /type="password"/u);
  assert.doesNotMatch(source, /storedLongPortBinding\.appKeyPreview/u);
});
