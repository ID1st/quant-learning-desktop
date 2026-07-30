import { CalendarClock, LogOut, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { AuthSessionSnapshot } from "@quant/shared";
import { maskEmail } from "./authService";
import { formatEntitlementRemaining } from "./entitlementTime";

interface LogoutConfirmationDialogProps {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  session: AuthSessionSnapshot;
}

export function LogoutConfirmationDialog({
  isSubmitting,
  onCancel,
  onConfirm,
  returnFocusRef,
  session,
}: LogoutConfirmationDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(
    () => () => {
      if (returnFocusRef) {
        returnFocusRef.current?.focus();
      }
    },
    [returnFocusRef],
  );

  useEffect(() => {
    cancelButtonRef.current?.focus();
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const focusableElements =
          dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!focusableElements?.length) {
          return;
        }
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSubmitting, onCancel]);

  return (
    <div
      className="logout-confirmation-backdrop"
      onClick={() => {
        if (!isSubmitting) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <section
        aria-labelledby="logout-confirmation-title"
        aria-modal="true"
        className="logout-confirmation-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="logout-confirmation-header">
          <div className="logout-confirmation-icon">
            <LogOut size={18} />
          </div>
          <div>
            <h2 id="logout-confirmation-title">确认退出登录？</h2>
            <p>退出不会删除本机策略、图表标记或行情缓存。</p>
          </div>
          <button
            aria-label="关闭退出确认"
            className="logout-confirmation-close"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            <X size={17} />
          </button>
        </header>

        <div className="logout-entitlement-summary">
          <div className="logout-entitlement-heading">
            <CalendarClock size={17} />
            <span>当前账号测试资格</span>
          </div>
          <dl>
            <div>
              <dt>账号</dt>
              <dd>{maskEmail(session.email)}</dd>
            </div>
            <div>
              <dt>资格档位</dt>
              <dd>{session.entitlementDurationDays} 天</dd>
            </div>
            <div>
              <dt>距离到期</dt>
              <dd className="logout-entitlement-remaining">
                {formatEntitlementRemaining(session.entitlementEndsAt, now)}
              </dd>
            </div>
            <div>
              <dt>到期时间</dt>
              <dd>
                {new Date(session.entitlementEndsAt).toLocaleString("zh-CN", {
                  hour12: false,
                })}
              </dd>
            </div>
          </dl>
        </div>

        <footer className="logout-confirmation-actions">
          <button
            className="logout-cancel-action"
            disabled={isSubmitting}
            onClick={onCancel}
            ref={cancelButtonRef}
            type="button"
          >
            继续使用
          </button>
          <button
            className="logout-confirm-action"
            disabled={isSubmitting}
            onClick={onConfirm}
            type="button"
          >
            <LogOut size={15} />
            {isSubmitting ? "正在退出…" : "确认退出"}
          </button>
        </footer>
      </section>
    </div>
  );
}
