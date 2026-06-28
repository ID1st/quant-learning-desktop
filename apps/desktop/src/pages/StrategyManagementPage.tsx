import { createEmptyStrategyRegistry } from "@quant/strategy-engine";
import { PlaceholderPage } from "../ui/PlaceholderPage";

const registry = createEmptyStrategyRegistry();

export function StrategyManagementPage() {
  return (
    <PlaceholderPage
      title="策略管理"
      description={`策略注册器占位页。当前已注册策略数量：${registry.list().length}。`}
    />
  );
}
