import { createApiClient } from "@quant/api-client";
import { PlaceholderPage } from "../ui/PlaceholderPage";

const apiClient = createApiClient();

export function ApiConfigPage() {
  return (
    <PlaceholderPage
      title="API Configuration"
      description={`API client placeholder using ${apiClient.transportName}. LongPort binding starts in a later phase.`}
    />
  );
}
