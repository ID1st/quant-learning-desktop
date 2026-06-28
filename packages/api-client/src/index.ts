import type { ApiResult } from "@quant/shared";

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
