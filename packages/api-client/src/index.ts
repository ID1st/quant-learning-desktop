import type { ApiResult } from "@quant/shared";
import { validatePluginManifest, type PluginCapability, type PluginManifest, type PluginPermission } from "@quant/plugin-loader";
export { isLoopbackHostname } from "./urlSecurity.ts";
export {
  ALPHAFEED_DEFAULT_API_URL,
  createAlphaFeedSecretPreview,
  fetchAlphaFeedHistoricalBars,
  fetchAlphaFeedIntradayBars,
  fetchAlphaFeedQuoteSnapshots,
  normalizeAlphaFeedApiCredentials,
  verifyAlphaFeedApiCredentials,
  type AlphaFeedAdjustType,
  type AlphaFeedApiCredentials,
  type AlphaFeedBarRequest,
  type AlphaFeedMarketDataBar,
  type AlphaFeedQuoteRequestItem,
  type AlphaFeedQuoteSnapshot,
  type AlphaFeedVerificationSummary,
  type NormalizedAlphaFeedApiCredentials,
} from "./alphafeed.ts";
export {
  LONGPORT_DEFAULT_HTTP_URL,
  createLongPortSecretPreview,
  normalizeLongPortApiCredentials,
  verifyLongPortApiCredentials,
  type LongPortApiCredentials,
  type LongPortBarRequest,
  type LongPortMarketDataBar,
  type LongPortVerificationOptions,
  type LongPortVerificationProbeResult,
  type LongPortVerificationSummary,
  type NormalizedLongPortApiCredentials,
} from "./longport.ts";

export interface ApiTransport {
  readonly name: string;
  request<TResponse>(request: ApiRequest): Promise<ApiResult<TResponse>>;
}

export interface ApiRequest {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

class UnconfiguredTransport implements ApiTransport {
  readonly name = "未配置";

  async request<TResponse>(): Promise<ApiResult<TResponse>> {
    throw new Error("API 通信通道尚未配置。");
  }
}

export interface ApiClient {
  readonly transportName: string;
  request<TResponse>(request: ApiRequest): Promise<ApiResult<TResponse>>;
}

export function createApiClient(transport: ApiTransport = new UnconfiguredTransport()): ApiClient {
  return {
    transportName: transport.name,
    request: (request) => transport.request(request),
  };
}

export interface PluginManifestPreflightInput {
  manifestText: string;
}

export type PluginManifestPreflightErrorCode = "EMPTY_MANIFEST" | "MANIFEST_TOO_LARGE" | "INVALID_JSON" | "INVALID_MANIFEST";

export interface PluginManifestPreflightError {
  code: PluginManifestPreflightErrorCode;
  message: string;
}

export interface PluginManifestPreflightSummary {
  capabilityCount: number;
  permissionCount: number;
  capabilities: PluginCapability[];
  permissions: PluginPermission[];
  requiresPermissionApproval: boolean;
}

export type PluginManifestPreflightResult =
  | {
      ok: true;
      manifest: PluginManifest;
      summary: PluginManifestPreflightSummary;
    }
  | {
      ok: false;
      error: PluginManifestPreflightError;
    };

export interface PluginInstallBridge {
  preflightManifest(input: PluginManifestPreflightInput): Promise<PluginManifestPreflightResult>;
}

const maxManifestBytes = 64 * 1024;

function createFailure(code: PluginManifestPreflightErrorCode, message: string): PluginManifestPreflightResult {
  return {
    ok: false,
    error: { code, message },
  };
}

export async function preflightPluginManifest(input: PluginManifestPreflightInput): Promise<PluginManifestPreflightResult> {
  const manifestText = input.manifestText.trim();

  if (manifestText.length === 0) {
    return createFailure("EMPTY_MANIFEST", "请粘贴 plugin.json 内容后再进行预检。");
  }

  if (new TextEncoder().encode(manifestText).byteLength > maxManifestBytes) {
    return createFailure("MANIFEST_TOO_LARGE", "插件清单过大，请确认选择的是 plugin.json 文件。");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return createFailure("INVALID_JSON", "plugin.json 不是有效的 JSON。");
  }

  try {
    const manifest = validatePluginManifest(parsed);
    return {
      ok: true,
      manifest,
      summary: {
        capabilityCount: manifest.capabilities.length,
        permissionCount: manifest.permissions.length,
        capabilities: manifest.capabilities,
        permissions: manifest.permissions,
        requiresPermissionApproval: manifest.permissions.length > 0,
      },
    };
  } catch (error) {
    return createFailure("INVALID_MANIFEST", error instanceof Error ? error.message : "插件清单结构无效。");
  }
}

export function createLocalPluginInstallBridge(): PluginInstallBridge {
  return {
    preflightManifest: preflightPluginManifest,
  };
}
