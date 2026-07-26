import { pathToFileURL } from "node:url";
import type { StrategyInput } from "@quant/strategy-engine";

export interface DesktopRendererSecurityPolicy {
  readonly packagedRendererUrl: string;
  readonly rendererDevOrigin?: string;
}

export interface DesktopRendererSecurityPolicyInput {
  readonly rendererEntry: string;
  readonly rendererDevServerUrl?: string;
}

export interface IpcSenderEventLike {
  readonly senderFrame?: { readonly url?: string } | null;
  readonly sender?: { getURL?(): string };
}

const markets = new Set(["US", "HK", "CN"]);
const timeframes = new Set(["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"]);
const requestSources = new Set(["chart", "sync", "strategy", "diagnostics"]);
const maxMarketDataItems = 200;
const maxStrategyBars = 5_000;

export function createDesktopRendererSecurityPolicy(
  input: DesktopRendererSecurityPolicyInput,
): DesktopRendererSecurityPolicy {
  let rendererDevOrigin: string | undefined;
  if (input.rendererDevServerUrl) {
    const url = new URL(input.rendererDevServerUrl);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !isLoopbackHostname(url.hostname)) {
      throw new Error("Electron renderer development URL must use HTTP(S) on a loopback host.");
    }
    rendererDevOrigin = url.origin;
  }

  return {
    packagedRendererUrl: pathToFileURL(input.rendererEntry).href,
    ...(rendererDevOrigin ? { rendererDevOrigin } : {}),
  };
}

export function isTrustedRendererUrl(candidate: string, policy: DesktopRendererSecurityPolicy) {
  try {
    const candidateUrl = new URL(candidate);
    if (policy.rendererDevOrigin && candidateUrl.origin === policy.rendererDevOrigin) {
      return true;
    }

    const packagedUrl = new URL(policy.packagedRendererUrl);
    return candidateUrl.protocol === "file:" &&
      candidateUrl.host === packagedUrl.host &&
      candidateUrl.pathname === packagedUrl.pathname;
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(event: IpcSenderEventLike, policy: DesktopRendererSecurityPolicy) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || "";
  if (!isTrustedRendererUrl(senderUrl, policy)) {
    throw new Error("IPC invocation rejected from an untrusted renderer.");
  }
}

export function assertRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

export function assertBoundedString(
  value: unknown,
  name: string,
  options: { readonly minLength?: number; readonly maxLength?: number; readonly pattern?: RegExp } = {},
): asserts value is string {
  const minLength = options.minLength ?? 1;
  const maxLength = options.maxLength ?? 512;
  if (
    typeof value !== "string" ||
    value.trim().length < minLength ||
    value.length > maxLength ||
    (options.pattern && !options.pattern.test(value))
  ) {
    throw new TypeError(`${name} is invalid.`);
  }
}

export function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be a boolean.`);
  }
}

export function assertMarketDataContext(value: unknown) {
  assertRecord(value, "context");
  if (!requestSources.has(String(value.source))) {
    throw new TypeError("context.source is invalid.");
  }
  if (value.requestId !== undefined) assertBoundedString(value.requestId, "context.requestId", { maxLength: 128 });
  if (value.requestedAt !== undefined) assertBoundedString(value.requestedAt, "context.requestedAt", { maxLength: 64 });
}

export function assertMarketDataItems(value: unknown, allowEmpty = false) {
  const minimumLength = allowEmpty ? 0 : 1;
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maxMarketDataItems) {
    throw new TypeError(`items must contain between ${minimumLength} and ${maxMarketDataItems} entries.`);
  }
  value.forEach((item, index) => {
    assertRecord(item, `items[${index}]`);
    assertMarket(item.market, `items[${index}].market`);
    assertBoundedString(item.symbol, `items[${index}].symbol`, { maxLength: 64 });
    if (item.name !== undefined) assertBoundedString(item.name, `items[${index}].name`, { maxLength: 160 });
  });
}

export function assertMarketDataBarRequest(value: unknown, allowAdditiveAdjustment = false) {
  assertRecord(value, "request");
  assertMarket(value.market, "request.market");
  assertBoundedString(value.symbol, "request.symbol", { maxLength: 64 });
  if (!timeframes.has(String(value.timeframe))) throw new TypeError("request.timeframe is invalid.");
  if (value.count !== undefined) assertIntegerRange(value.count, "request.count", 1, 5_000);
  if (value.startTime !== undefined) assertFiniteRange(value.startTime, "request.startTime", 0, Number.MAX_SAFE_INTEGER);
  if (value.endTime !== undefined) assertFiniteRange(value.endTime, "request.endTime", 0, Number.MAX_SAFE_INTEGER);
  if (typeof value.startTime === "number" && typeof value.endTime === "number" && value.startTime > value.endTime) {
    throw new TypeError("request.startTime must not exceed request.endTime.");
  }
  if (value.adjust !== undefined) {
    const adjustments = allowAdditiveAdjustment
      ? new Set(["none", "forward", "backward", "forward_additive", "backward_additive"])
      : new Set(["none", "forward", "backward"]);
    if (!adjustments.has(String(value.adjust))) throw new TypeError("request.adjust is invalid.");
  }
}

export function assertMarketDataProviderPolicy(value: unknown) {
  if (value === undefined) return;
  assertRecord(value, "providerPolicy");
  if (value.stockSdkPrimaryEnabled !== undefined) assertBoolean(value.stockSdkPrimaryEnabled, "providerPolicy.stockSdkPrimaryEnabled");
  if (value.alphaFeedStreamMode !== undefined && value.alphaFeedStreamMode !== "watchlist" && value.alphaFeedStreamMode !== "all-symbols") {
    throw new TypeError("providerPolicy.alphaFeedStreamMode is invalid.");
  }
  if (value.mlptHistory !== undefined) {
    assertRecord(value.mlptHistory, "providerPolicy.mlptHistory");
    assertIntegerRange(value.mlptHistory.targetBars, "providerPolicy.mlptHistory.targetBars", 1, maxStrategyBars);
    assertFiniteRange(
      value.mlptHistory.confirmedThroughTimestamp,
      "providerPolicy.mlptHistory.confirmedThroughTimestamp",
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (!Array.isArray(value.mlptHistory.knownTimestamps) || value.mlptHistory.knownTimestamps.length > maxStrategyBars) {
      throw new TypeError(`providerPolicy.mlptHistory.knownTimestamps must contain at most ${maxStrategyBars} entries.`);
    }
    value.mlptHistory.knownTimestamps.forEach((timestamp, index) =>
      assertFiniteRange(
        timestamp,
        `providerPolicy.mlptHistory.knownTimestamps[${index}]`,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    );
  }
}

export function assertMarketDataSearchRequest(value: unknown) {
  assertRecord(value, "request");
  assertMarketDataContext(value.context);
  assertBoundedString(value.query, "request.query", { maxLength: 120 });
  if (value.markets !== undefined) {
    if (!Array.isArray(value.markets) || value.markets.length === 0 || value.markets.length > 3) {
      throw new TypeError("request.markets is invalid.");
    }
    value.markets.forEach((market, index) => assertMarket(market, `request.markets[${index}]`));
  }
  assertMarketDataProviderPolicy(value.providerPolicy);
}

export function assertAlphaFeedCredentials(value: unknown) {
  assertRecord(value, "credentials");
  assertHttpUrl(value.apiUrl, "credentials.apiUrl");
  assertBoundedString(value.apiKey, "credentials.apiKey", { maxLength: 8_192 });
}

export function assertAlphaFeedStreamCredentials(value: unknown) {
  assertRecord(value, "credentials");
  assertWebSocketUrl(value.wsUrl, "credentials.wsUrl");
  assertBoundedString(value.apiKey, "credentials.apiKey", { maxLength: 8_192 });
}

export function assertLongPortCredentials(value: unknown) {
  assertRecord(value, "credentials");
  assertHttpUrl(value.apiUrl, "credentials.apiUrl");
  assertBoundedString(value.appKey, "credentials.appKey", { maxLength: 8_192 });
  assertBoundedString(value.appSecret, "credentials.appSecret", { maxLength: 8_192 });
  assertBoundedString(value.accessToken, "credentials.accessToken", { maxLength: 8_192 });
}

export function assertPluginId(value: unknown, name = "pluginId"): asserts value is string {
  assertBoundedString(value, name, { maxLength: 160, pattern: /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/iu });
}

export function assertPluginStrategyInput(value: unknown): asserts value is StrategyInput {
  assertRecord(value, "input");
  assertBoundedString(value.symbol, "input.symbol", { maxLength: 64 });
  assertMarket(value.market, "input.market");
  if (!timeframes.has(String(value.timeframe))) throw new TypeError("input.timeframe is invalid.");
  if (value.runMode !== "live" && value.runMode !== "backtest") throw new TypeError("input.runMode is invalid.");
  if (!Array.isArray(value.bars) || value.bars.length > maxStrategyBars) {
    throw new TypeError(`input.bars must contain at most ${maxStrategyBars} entries.`);
  }
  value.bars.forEach((bar, index) => {
    assertRecord(bar, `input.bars[${index}]`);
    for (const field of ["timestamp", "open", "high", "low", "close", "volume"] as const) {
      assertFiniteRange(bar[field], `input.bars[${index}].${field}`, field === "volume" ? 0 : -Number.MAX_VALUE, Number.MAX_VALUE);
    }
  });
  assertRecord(value.parameters, "input.parameters");
  assertJsonSize(value.parameters, "input.parameters", 64 * 1024);
  if (value.enabled !== undefined) assertBoolean(value.enabled, "input.enabled");
}

function assertMarket(value: unknown, name: string) {
  if (!markets.has(String(value))) throw new TypeError(`${name} is invalid.`);
}

function assertIntegerRange(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function assertFiniteRange(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be a finite number between ${minimum} and ${maximum}.`);
  }
}

function assertHttpUrl(value: unknown, name: string) {
  assertBoundedString(value, name, { maxLength: 2_048 });
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new TypeError(`${name} must be a valid HTTP(S) URL.`);
  }
}

function assertWebSocketUrl(value: unknown, name: string) {
  assertBoundedString(value, name, { maxLength: 2_048 });
  try {
    const url = new URL(value);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error("invalid protocol");
  } catch {
    throw new TypeError(`${name} must be a valid WebSocket URL.`);
  }
}

function assertJsonSize(value: unknown, name: string, maximumBytes: number) {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new TypeError(`${name} must be JSON serializable.`);
  }
  if (new TextEncoder().encode(encoded).byteLength > maximumBytes) {
    throw new TypeError(`${name} exceeds the maximum payload size.`);
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
