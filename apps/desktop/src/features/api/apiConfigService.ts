import {
  ALPHAFEED_DEFAULT_API_URL,
  createAlphaFeedSecretPreview,
  verifyAlphaFeedApiCredentials,
  LONGPORT_DEFAULT_HTTP_URL,
  verifyLongPortApiCredentials,
  type AlphaFeedApiCredentials,
  type LongPortApiCredentials,
} from "@quant/api-client";
import type { Market } from "@quant/shared";
import { appLocalDatabase } from "../persistence/localDatabase.ts";

export { ALPHAFEED_DEFAULT_API_URL, LONGPORT_DEFAULT_HTTP_URL };

export type LongPortApiForm = LongPortApiCredentials;
export type AlphaFeedApiForm = AlphaFeedApiCredentials;
export type AlphaFeedStreamMode = "watchlist" | "all-symbols";

export interface AlphaFeedStreamForm {
  wsUrl: string;
  apiKey: string;
  mode: AlphaFeedStreamMode;
}

export interface LongPortApiBinding {
  apiUrl: string;
  appKeyPreview: string;
  accessTokenPreview: string;
  markets: Market[];
  verifiedAt: string;
  accountId?: string;
  authMode: "legacy-api-key";
  activatedAt?: string;
}

export interface AlphaFeedApiBinding {
  apiUrl: string;
  apiKeyPreview: string;
  markets: Market[];
  verifiedAt: string;
  authMode: "api-key";
  activatedAt?: string;
}

export interface AlphaFeedStreamBinding {
  wsUrl: string;
  apiKeyPreview: string;
  mode: AlphaFeedStreamMode;
  preparedAt: string;
  status: "prepared";
}

const LONGPORT_COLLECTION_KEY = "longport-api-binding";
const ALPHAFEED_COLLECTION_KEY = "alphafeed-api-binding";
const ALPHAFEED_STREAM_COLLECTION_KEY = "alphafeed-stream-binding";
const STORAGE_VERSION = 1;
export const ALPHAFEED_DEFAULT_STREAM_URL = "wss://api.tickflow.org/v1/ws/stream";

function sanitizeBinding(value: unknown): LongPortApiBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const binding = value as Partial<LongPortApiBinding> & {
    keyPreview?: string;
    boundAt?: string;
  };
  const appKeyPreview = binding.appKeyPreview ?? binding.keyPreview;
  const verifiedAt = binding.verifiedAt ?? binding.boundAt;

  if (!binding.apiUrl || !appKeyPreview || !verifiedAt || !binding.markets || !binding.activatedAt) {
    return null;
  }

  return {
    apiUrl: binding.apiUrl,
    appKeyPreview,
    accessTokenPreview: binding.accessTokenPreview ?? "********",
    markets: binding.markets,
    verifiedAt,
    accountId: binding.accountId,
    authMode: binding.authMode ?? "legacy-api-key",
    activatedAt: binding.activatedAt,
  };
}

export function readLongPortApiBinding(): LongPortApiBinding | null {
  return appLocalDatabase.readDocument(LONGPORT_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeBinding,
  });
}

export function clearLongPortApiBinding() {
  appLocalDatabase.removeDocument(LONGPORT_COLLECTION_KEY);
  void window.quantDesktop?.secureCredentials?.clearLongPort();
}

function sanitizeAlphaFeedBinding(value: unknown): AlphaFeedApiBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const binding = value as Partial<AlphaFeedApiBinding>;
  if (!binding.apiUrl || !binding.apiKeyPreview || !binding.verifiedAt || !binding.markets || !binding.activatedAt) {
    return null;
  }

  return {
    apiUrl: binding.apiUrl,
    apiKeyPreview: binding.apiKeyPreview,
    markets: binding.markets,
    verifiedAt: binding.verifiedAt,
    authMode: "api-key",
    activatedAt: binding.activatedAt,
  };
}

export function readAlphaFeedApiBinding(): AlphaFeedApiBinding | null {
  return appLocalDatabase.readDocument(ALPHAFEED_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeAlphaFeedBinding,
  });
}

export function clearAlphaFeedApiBinding() {
  appLocalDatabase.removeDocument(ALPHAFEED_COLLECTION_KEY);
  void window.quantDesktop?.secureCredentials?.clearAlphaFeed();
}

function sanitizeAlphaFeedStreamMode(value: unknown): AlphaFeedStreamMode {
  return value === "all-symbols" ? "all-symbols" : "watchlist";
}

function sanitizeAlphaFeedStreamBinding(value: unknown): AlphaFeedStreamBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const binding = value as Partial<AlphaFeedStreamBinding>;
  if (!binding.wsUrl || !binding.apiKeyPreview || !binding.preparedAt) {
    return null;
  }

  return {
    wsUrl: binding.wsUrl,
    apiKeyPreview: binding.apiKeyPreview,
    mode: sanitizeAlphaFeedStreamMode(binding.mode),
    preparedAt: binding.preparedAt,
    status: "prepared",
  };
}

export function readAlphaFeedStreamBinding(): AlphaFeedStreamBinding | null {
  return appLocalDatabase.readDocument(ALPHAFEED_STREAM_COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: null,
    sanitize: sanitizeAlphaFeedStreamBinding,
  });
}

export function clearAlphaFeedStreamBinding() {
  appLocalDatabase.removeDocument(ALPHAFEED_STREAM_COLLECTION_KEY);
  void window.quantDesktop?.secureCredentials?.clearAlphaFeedStream();
}

async function saveAlphaFeedCredentials(form: AlphaFeedApiForm) {
  const result = await window.quantDesktop?.secureCredentials?.saveAlphaFeed(form);

  if (!result) {
    throw new Error("AlphaFeed 安全凭据保存需要桌面安全桥，请在桌面应用中运行。");
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

async function saveAlphaFeedStreamCredentials(form: AlphaFeedStreamForm) {
  const result = await window.quantDesktop?.secureCredentials?.saveAlphaFeedStream({
    wsUrl: form.wsUrl,
    apiKey: form.apiKey,
  });

  if (!result) {
    throw new Error("AlphaFeed WebSocket 安全凭据保存需要桌面安全桥，请在桌面应用中运行。");
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

async function saveLongPortCredentials(form: LongPortApiForm) {
  const result = await window.quantDesktop?.secureCredentials?.saveLongPort(form);

  if (!result) {
    throw new Error("长桥安全凭据保存需要桌面安全桥，请在桌面应用中运行。");
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }
}

export async function readSavedAlphaFeedCredentials(): Promise<AlphaFeedApiForm | null> {
  const result = await window.quantDesktop?.secureCredentials?.readAlphaFeed();

  if (!result) {
    return null;
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.credentials;
}

export async function readSavedAlphaFeedStreamCredentials(): Promise<Pick<AlphaFeedStreamForm, "wsUrl" | "apiKey"> | null> {
  const result = await window.quantDesktop?.secureCredentials?.readAlphaFeedStream();

  if (!result) {
    return null;
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.credentials;
}

function normalizeAlphaFeedStreamForm(form: AlphaFeedStreamForm): AlphaFeedStreamForm {
  const wsUrl = form.wsUrl.trim() || ALPHAFEED_DEFAULT_STREAM_URL;
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(wsUrl);
  } catch {
    throw new Error("请输入有效的 AlphaFeed WebSocket URL。");
  }

  if (!["ws:", "wss:"].includes(parsedUrl.protocol)) {
    throw new Error("AlphaFeed WebSocket URL 需要以 ws 或 wss 开头。");
  }

  const apiKey = form.apiKey.trim();
  if (apiKey.length < 8) {
    throw new Error("AlphaFeed WebSocket API Key 至少需要 8 位。");
  }

  return {
    wsUrl: parsedUrl.toString(),
    apiKey,
    mode: sanitizeAlphaFeedStreamMode(form.mode),
  };
}

export async function saveAlphaFeedStreamConfig(form: AlphaFeedStreamForm): Promise<AlphaFeedStreamBinding> {
  const normalized = normalizeAlphaFeedStreamForm(form);

  await saveAlphaFeedStreamCredentials(normalized);

  const binding: AlphaFeedStreamBinding = {
    wsUrl: normalized.wsUrl,
    apiKeyPreview: createAlphaFeedSecretPreview(normalized.apiKey),
    mode: normalized.mode,
    preparedAt: new Date().toISOString(),
    status: "prepared",
  };

  appLocalDatabase.writeDocument(ALPHAFEED_STREAM_COLLECTION_KEY, STORAGE_VERSION, binding);
  return binding;
}

export async function readSavedLongPortCredentials(): Promise<LongPortApiForm | null> {
  const result = await window.quantDesktop?.secureCredentials?.readLongPort();

  if (!result) {
    return null;
  }

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.credentials;
}

export async function resolveAlphaFeedCredentials(form: AlphaFeedApiForm): Promise<AlphaFeedApiForm> {
  if (form.apiKey.trim()) {
    return {
      ...form,
      apiUrl: form.apiUrl || ALPHAFEED_DEFAULT_API_URL,
    };
  }

  const savedCredentials = await readSavedAlphaFeedCredentials();
  if (savedCredentials) {
    return {
      ...savedCredentials,
      apiUrl: form.apiUrl || savedCredentials.apiUrl || ALPHAFEED_DEFAULT_API_URL,
    };
  }

  return {
    ...form,
    apiUrl: form.apiUrl || ALPHAFEED_DEFAULT_API_URL,
  };
}

export async function resolveLongPortCredentials(form: LongPortApiForm): Promise<LongPortApiForm> {
  if (form.appKey.trim() && form.appSecret.trim() && form.accessToken.trim()) {
    return {
      ...form,
      apiUrl: form.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
    };
  }

  const savedCredentials = await readSavedLongPortCredentials();
  if (savedCredentials) {
    return {
      ...savedCredentials,
      apiUrl: form.apiUrl || savedCredentials.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
    };
  }

  return {
    ...form,
    apiUrl: form.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
  };
}

async function verifyWithDesktopBridge(form: LongPortApiForm): Promise<LongPortApiBinding> {
  const bridge = window.quantDesktop?.longPort;

  if (!bridge) {
    throw new Error("长桥 API 联网验证需要桌面安全桥，请在桌面应用中运行。");
  }

  const result = await bridge.verifyCredentials(form);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.summary;
}

export async function verifyLongPortApiConfig(form: LongPortApiForm): Promise<LongPortApiBinding> {
  const credentials = await resolveLongPortCredentials(form);

  await verifyLongPortApiCredentials(
    {
      ...credentials,
      apiUrl: credentials.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
    },
    {
      probe: async () => undefined,
    },
  );

  const verifiedBinding = await verifyWithDesktopBridge({
    ...credentials,
    apiUrl: credentials.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
  });
  const binding: LongPortApiBinding = {
    ...verifiedBinding,
    activatedAt: new Date().toISOString(),
  };

  await saveLongPortCredentials({
    ...credentials,
    apiUrl: credentials.apiUrl || LONGPORT_DEFAULT_HTTP_URL,
  });
  appLocalDatabase.writeDocument(LONGPORT_COLLECTION_KEY, STORAGE_VERSION, binding);
  return binding;
}

async function verifyAlphaFeedWithDesktopBridge(form: AlphaFeedApiForm): Promise<AlphaFeedApiBinding> {
  const bridge = window.quantDesktop?.alphaFeed;

  if (!bridge) {
    throw new Error("AlphaFeed API 联网验证需要桌面安全桥，请在桌面应用中运行。");
  }

  const result = await bridge.verifyCredentials(form);
  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.summary;
}

export async function verifyAlphaFeedApiConfig(form: AlphaFeedApiForm): Promise<AlphaFeedApiBinding> {
  const credentials = await resolveAlphaFeedCredentials(form);

  await verifyAlphaFeedApiCredentials(
    {
      ...credentials,
      apiUrl: credentials.apiUrl || ALPHAFEED_DEFAULT_API_URL,
    },
    {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                symbol: "600519.SH",
                region: "CN",
                last_price: 1,
                prev_close: 1,
                open: 1,
                high: 1,
                low: 1,
                volume: 1,
                amount: 1,
                timestamp: Date.now(),
              },
            ],
          }),
        ),
    },
  );

  const verifiedBinding = await verifyAlphaFeedWithDesktopBridge({
    ...credentials,
    apiUrl: credentials.apiUrl || ALPHAFEED_DEFAULT_API_URL,
  });
  const binding: AlphaFeedApiBinding = {
    ...verifiedBinding,
    activatedAt: new Date().toISOString(),
  };

  await saveAlphaFeedCredentials({
    ...credentials,
    apiUrl: credentials.apiUrl || ALPHAFEED_DEFAULT_API_URL,
  });
  appLocalDatabase.writeDocument(ALPHAFEED_COLLECTION_KEY, STORAGE_VERSION, binding);
  return binding;
}
