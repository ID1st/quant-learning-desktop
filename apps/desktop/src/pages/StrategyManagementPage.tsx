import { createEmptyStrategyRegistry } from "@quant/strategy-engine";
import { PlaceholderPage } from "../ui/PlaceholderPage";

const registry = createEmptyStrategyRegistry();

export function StrategyManagementPage() {
  return (
    <PlaceholderPage
      title="Strategy Management"
      description={`Strategy registry placeholder. Registered strategies: ${registry.list().length}.`}
    />
  );
}
