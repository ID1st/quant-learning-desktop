export type ApiProviderStatus = "placeholder" | "enabled" | "unconfigured" | "configured" | "prepared";

export interface ApiProviderPriorityItem {
  readonly id: "stock-sdk" | "alphafeed-rest" | "alphafeed-websocket" | "longbridge";
  readonly name: string;
  readonly role: "primary" | "fallback";
  readonly order: number;
  readonly capabilityBadges: readonly string[];
}

export interface ApiProviderBindingState {
  readonly stockSdkPrimaryEnabled?: boolean;
  readonly alphaFeedRestBound: boolean;
  readonly alphaFeedWebSocketPrepared: boolean;
  readonly longBridgeBound: boolean;
}

export const apiProviderPriorityItems: readonly ApiProviderPriorityItem[] = [
  {
    id: "stock-sdk",
    name: "Stock SDK 主行情源",
    role: "primary",
    order: 1,
    capabilityBadges: ["A股", "港股", "美股", "实时行情", "历史 K 线", "分时"],
  },
  {
    id: "alphafeed-rest",
    name: "AlphaFeed REST",
    role: "fallback",
    order: 2,
    capabilityBadges: ["批量快照", "日线", "周线", "REST 轮询"],
  },
  {
    id: "alphafeed-websocket",
    name: "AlphaFeed WebSocket 会员通道",
    role: "fallback",
    order: 3,
    capabilityBadges: ["流式快照", "关注列表", "会员全标的"],
  },
  {
    id: "longbridge",
    name: "长桥备用源",
    role: "fallback",
    order: 4,
    capabilityBadges: ["历史 K 线", "分时回补", "券商接口"],
  },
];

export function getApiProviderStatus(
  providerId: ApiProviderPriorityItem["id"],
  bindingState: ApiProviderBindingState,
): ApiProviderStatus {
  if (providerId === "stock-sdk") {
    return bindingState.stockSdkPrimaryEnabled ? "enabled" : "placeholder";
  }

  if (providerId === "alphafeed-rest") {
    return bindingState.alphaFeedRestBound ? "configured" : "unconfigured";
  }

  if (providerId === "alphafeed-websocket") {
    return bindingState.alphaFeedWebSocketPrepared ? "prepared" : "unconfigured";
  }

  return bindingState.longBridgeBound ? "configured" : "unconfigured";
}

export function formatApiProviderStatus(status: ApiProviderStatus) {
  const labels: Record<ApiProviderStatus, string> = {
    placeholder: "待接入",
    enabled: "已启用",
    unconfigured: "未配置",
    configured: "已配置",
    prepared: "已预留",
  };

  return labels[status];
}
