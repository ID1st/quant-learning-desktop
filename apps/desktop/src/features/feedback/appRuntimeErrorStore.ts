import { create } from "zustand";

export type AppRuntimeErrorScope = "render" | "window-error" | "unhandled-rejection";

export interface AppRuntimeErrorRecord {
  readonly id: string;
  readonly scope: AppRuntimeErrorScope;
  readonly message: string;
  readonly occurredAt: string;
}

const maximumRuntimeErrors = 12;

function sanitizeRuntimeErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "发生未知运行时错误。";
  return message
    .replace(/([?&](?:api[_-]?key|token|secret|password)=)[^&\s]+/giu, "$1[已隐藏]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 320) || "发生未知运行时错误。";
}

export function createAppRuntimeErrorRecord(
  scope: AppRuntimeErrorScope,
  error: unknown,
  occurredAt = new Date().toISOString(),
): AppRuntimeErrorRecord {
  return {
    id: `runtime-error-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    scope,
    message: sanitizeRuntimeErrorMessage(error),
    occurredAt,
  };
}

export function appendAppRuntimeError(
  records: readonly AppRuntimeErrorRecord[],
  record: AppRuntimeErrorRecord,
): AppRuntimeErrorRecord[] {
  const hasRecentDuplicate = records.some((item) =>
    item.scope === record.scope &&
    item.message === record.message &&
    Math.abs(Date.parse(item.occurredAt) - Date.parse(record.occurredAt)) <= 5_000,
  );

  return hasRecentDuplicate ? [...records] : [record, ...records].slice(0, maximumRuntimeErrors);
}

interface AppRuntimeErrorState {
  readonly records: readonly AppRuntimeErrorRecord[];
  report: (scope: AppRuntimeErrorScope, error: unknown) => AppRuntimeErrorRecord;
  clear: () => void;
}

export const useAppRuntimeErrorStore = create<AppRuntimeErrorState>((set, get) => ({
  records: [],
  report: (scope, error) => {
    const record = createAppRuntimeErrorRecord(scope, error);
    set((state) => ({ records: appendAppRuntimeError(state.records, record) }));
    return get().records[0] ?? record;
  },
  clear: () => set({ records: [] }),
}));
