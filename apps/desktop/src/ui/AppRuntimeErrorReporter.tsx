import { useEffect } from "react";
import { useAppRuntimeErrorStore } from "../features/feedback/appRuntimeErrorStore";
import { useToastStore } from "../features/feedback/toastStore";

export function AppRuntimeErrorReporter() {
  const report = useAppRuntimeErrorStore((state) => state.report);
  const pushToast = useToastStore((state) => state.push);

  useEffect(() => {
    const reportError = (scope: "window-error" | "unhandled-rejection", error: unknown) => {
      const record = report(scope, error);
      pushToast({
        tone: "error",
        title: "运行异常已记录",
        detail: record.message,
        durationMs: 4200,
      });
    };
    const handleWindowError = (event: ErrorEvent) =>
      reportError("window-error", event.error ?? event.message);
    const handleUnhandledRejection = (event: PromiseRejectionEvent) =>
      reportError("unhandled-rejection", event.reason);

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [pushToast, report]);

  return null;
}
