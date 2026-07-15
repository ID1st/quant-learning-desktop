import { pluginExecutionDisabledMessage } from "./pluginRuntimeHost.ts";
import type {
  PluginRuntimeHostRequest,
  PluginRuntimeHostResponse,
} from "./pluginRuntimeProtocol.ts";

const runtime = createPluginUtilityRuntime((response) => process.parentPort?.postMessage(response));

process.parentPort?.on("message", (event) => {
  void runtime(event.data as PluginRuntimeHostRequest).catch((error) => {
    const id = getRequestId(event.data);
    if (id) post({ id, ok: false, message: sanitizeError(error) });
  });
});

export function createPluginUtilityRuntime(postResponse: (response: PluginRuntimeHostResponse) => void) {
  return async (request: PluginRuntimeHostRequest) => {
    postResponse({ id: request.id, ok: false, message: pluginExecutionDisabledMessage });
  };
}

function getRequestId(value: unknown) {
  return value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;
}

function sanitizeError(error: unknown) {
  return (error instanceof Error && error.message.trim() ? error.message : "Plugin runtime failed.")
    .replace(/\s+/gu, " ")
    .slice(0, 800);
}

function post(response: PluginRuntimeHostResponse) {
  process.parentPort?.postMessage(response);
}
