import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useToastStore, type ToastTone } from "../features/feedback/toastStore";
import { useI18n } from "../i18n/I18nProvider";

function getToastIcon(tone: ToastTone) {
  if (tone === "success") {
    return CheckCircle2;
  }

  if (tone === "warning") {
    return AlertTriangle;
  }

  if (tone === "error") {
    return XCircle;
  }

  return Info;
}

export function ToastViewport() {
  const { t } = useI18n();
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismiss(toast.id), toast.durationMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismiss, toasts]);

  return (
    <div aria-atomic="true" aria-live="polite" className="toast-viewport">
      {toasts.map((toast) => {
        const Icon = getToastIcon(toast.tone);

        return (
          <div className={`toast-message ${toast.tone}`} key={toast.id} role="status">
            <Icon size={17} />
            <span>
              <strong>{toast.title}</strong>
              {toast.detail && <small>{toast.detail}</small>}
            </span>
            <button aria-label={t("关闭通知")} onClick={() => dismiss(toast.id)} type="button">
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
