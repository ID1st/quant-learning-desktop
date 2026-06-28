import { createApiClient } from "@quant/api-client";
import { PlaceholderPage } from "../ui/PlaceholderPage";

const apiClient = createApiClient();

export function ApiConfigPage() {
  return (
    <PlaceholderPage
      title="接口配置"
      description={`当前接口客户端为占位状态：${apiClient.transportName}。长桥绑定将在后续阶段实现。`}
    />
  );
}
