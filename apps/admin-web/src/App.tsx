import {
  ArrowRight,
  Check,
  Clipboard,
  Clock3,
  Download,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminApiError,
  adminApi,
  type AdminIdentity,
  type BatchPage,
  type InviteBatch,
} from "./api.ts";
import {
  buildInviteCsv,
  buildInviteEntries,
  DURATION_TIERS,
  type DurationCounts,
  type InviteCodeResult,
} from "./inviteExport.ts";

const EMPTY_COUNTS: DurationCounts = { 7: 0, 30: 0, 90: 0, 365: 0 };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Shell({
  children,
  admin,
  onLogout,
}: {
  children: React.ReactNode;
  admin?: AdminIdentity | null;
  onLogout?: () => void;
}) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>QUANT LEARNING</strong>
            <small>服务中心</small>
          </span>
        </button>
        {admin ? (
          <div className="account-actions">
            <span className="account-email">{admin.email}</span>
            <button className="button ghost" type="button" onClick={onLogout}>
              <LogOut size={16} />
              退出
            </button>
          </div>
        ) : (
          <button className="button quiet" type="button" onClick={() => navigate("/admin")}>
            <LogIn size={17} />
            管理员登录
          </button>
        )}
      </header>
      {children}
      <footer>
        <span>fnndp.xyz</span>
        <span>本地优先 · 安全连接 · 最小权限</span>
      </footer>
    </div>
  );
}

function HomePage() {
  return (
    <Shell>
      <main className="home-main">
        <section className="hero">
          <div>
            <p className="eyebrow">QUANT RESEARCH WORKSTATION</p>
            <h1>把复杂研究，留在清晰的工作台里。</h1>
            <p className="hero-copy">
              桌面端量化学习与策略研究环境。行情、图表和研究资料优先保存在本机，
              云端仅承担账户资格与必要的授权服务。
            </p>
            <a className="button primary" href="/downloads/">
              获取桌面端
              <ArrowRight size={17} />
            </a>
          </div>
          <div className="signal-field" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="signal-core">
              <Sparkles size={34} />
            </span>
          </div>
        </section>
        <section className="service-grid" aria-label="服务特性">
          <article>
            <ShieldCheck />
            <h2>资格服务</h2>
            <p>最小化云端数据，仅保存账户授权与安全审计所需记录。</p>
          </article>
          <article>
            <Clock3 />
            <h2>离线可用</h2>
            <p>短时断网不打断研究流程，授权状态由签名租约安全验证。</p>
          </article>
          <article>
            <KeyRound />
            <h2>受控访问</h2>
            <p>邀请码分级授权，管理入口不提供公开注册或密码登录。</p>
          </article>
        </section>
      </main>
    </Shell>
  );
}

function LoginPanel({ onLogin }: { onLogin: (admin: AdminIdentity) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  async function sendCode() {
    setBusy(true);
    setNotice("");
    try {
      await adminApi.requestLoginCode(email.trim());
      setSent(true);
      setRemaining(60);
      setNotice("若邮箱已获授权，验证码将在几分钟内送达。");
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const result = await adminApi.login(email.trim(), code.trim());
      onLogin(result.admin);
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-main">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="panel-icon">
          <KeyRound size={22} />
        </div>
        <p className="eyebrow">RESTRICTED ACCESS</p>
        <h1 id="login-title">管理员验证</h1>
        <p className="muted">仅预置管理员邮箱可收到验证码。本站不提供注册入口。</p>
        <form onSubmit={submit}>
          <label>
            管理员邮箱
            <input
              autoComplete="email"
              inputMode="email"
              placeholder="name@example.com"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {sent && (
            <label>
              6 位验证码
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              />
            </label>
          )}
          <div className="login-actions">
            <button
              className="button quiet"
              disabled={busy || remaining > 0 || !email.trim()}
              type="button"
              onClick={sendCode}
            >
              {remaining > 0 ? `${remaining} 秒后重发` : "发送验证码"}
            </button>
            {sent && (
              <button className="button primary" disabled={busy || code.length !== 6} type="submit">
                {busy ? "验证中…" : "进入管理台"}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
          {notice && <p className="form-notice">{notice}</p>}
        </form>
      </section>
    </main>
  );
}

function ResultsPanel({
  batch,
  codes,
  onClear,
}: {
  batch: InviteBatch;
  codes: InviteCodeResult[];
  onClear: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.map((item) => item.inviteCode).join("\n"));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1_500);
  }

  function downloadCsv() {
    const blob = new Blob([buildInviteCsv(codes)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `invite-batch-${batch.batchId}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <section className="result-panel" aria-live="polite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ONE-TIME RESULT</p>
          <h2>邀请码已生成</h2>
          <p className="muted">明文只在当前页面内存中保留。刷新或离开页面后无法恢复。</p>
        </div>
        <span className="status good">
          <Check size={15} /> {codes.length} 个
        </span>
      </div>
      <div className="result-actions">
        <button className="button quiet" type="button" onClick={copyAll}>
          <Clipboard size={16} />
          {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制全部"}
        </button>
        <button className="button quiet" type="button" onClick={downloadCsv}>
          <Download size={16} />
          下载 CSV
        </button>
        <button className="button ghost" type="button" onClick={onClear}>
          清除明文
        </button>
      </div>
      <div className="code-list">
        {codes.map((item, index) => (
          <div className="code-row" key={`${item.inviteCode}-${index}`}>
            <code>{item.inviteCode}</code>
            <span>{item.durationDays} 天</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BatchHistory({
  data,
  loading,
  onPage,
  onRevoke,
}: {
  data: BatchPage | null;
  loading: boolean;
  onPage: (page: number) => void;
  onRevoke: (batch: InviteBatch) => void;
}) {
  return (
    <section className="history-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AUDITABLE HISTORY</p>
          <h2>生成历史</h2>
        </div>
        {loading && <RefreshCw className="spin" size={18} />}
      </div>
      {!loading && data?.items.length === 0 ? (
        <div className="empty-state">尚未生成邀请码批次。</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>创建时间</th>
                <th>批次</th>
                <th>状态</th>
                <th>有效 / 已兑换 / 已撤销</th>
                <th>领取截止</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((batch) => (
                <tr key={batch.batchId}>
                  <td>{formatDate(batch.createdAt)}</td>
                  <td>
                    <code className="batch-id">{batch.batchId.slice(0, 8)}</code>
                  </td>
                  <td>
                    <span className={`status ${batch.status === "ACTIVE" ? "good" : "neutral"}`}>
                      {batch.status === "ACTIVE" ? "进行中" : "已撤销"}
                    </span>
                  </td>
                  <td>
                    {batch.activeCount} / {batch.redeemedCount} / {batch.revokedCount}
                  </td>
                  <td>{formatDate(batch.claimExpiresAt)}</td>
                  <td>
                    <button
                      aria-label={`撤销批次 ${batch.batchId}`}
                      className="icon-button danger"
                      disabled={batch.status !== "ACTIVE" || batch.activeCount === 0}
                      title="撤销未使用邀请码"
                      type="button"
                      onClick={() => onRevoke(batch)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pagination.totalPages > 1 && (
        <nav className="pagination" aria-label="历史分页">
          <button
            className="button ghost"
            disabled={data.pagination.page <= 1}
            type="button"
            onClick={() => onPage(data.pagination.page - 1)}
          >
            上一页
          </button>
          <span>
            {data.pagination.page} / {data.pagination.totalPages}
          </span>
          <button
            className="button ghost"
            disabled={data.pagination.page >= data.pagination.totalPages}
            type="button"
            onClick={() => onPage(data.pagination.page + 1)}
          >
            下一页
          </button>
        </nav>
      )}
    </section>
  );
}

function AdminDashboard({
  admin,
  onSessionExpired,
  onLogout,
}: {
  admin: AdminIdentity;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
  const [counts, setCounts] = useState<DurationCounts>(EMPTY_COUNTS);
  const [claimDays, setClaimDays] = useState(30);
  const [result, setResult] = useState<{
    batch: InviteBatch;
    codes: InviteCodeResult[];
  } | null>(null);
  const [history, setHistory] = useState<BatchPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(true);
  const [error, setError] = useState("");

  const entries = useMemo(() => buildInviteEntries(counts), [counts]);
  const batchRequest = useRef<{ payload: string; id: string } | null>(null);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  const handleApiError = useCallback(
    (caught: unknown) => {
      if (caught instanceof AdminApiError && caught.status === 401) {
        onSessionExpired();
        return;
      }
      setError(messageOf(caught));
    },
    [onSessionExpired],
  );

  const loadHistory = useCallback(
    async (page = 1) => {
      setHistoryBusy(true);
      try {
        setHistory(await adminApi.listBatches(page));
      } catch (caught) {
        handleApiError(caught);
      } finally {
        setHistoryBusy(false);
      }
    },
    [handleApiError],
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function createBatch(event: React.FormEvent) {
    event.preventDefault();
    if (total < 1 || total > 500) return;
    setBusy(true);
    setError("");
    try {
      const payload = JSON.stringify({ entries, claimDays });
      if (batchRequest.current?.payload !== payload) {
        batchRequest.current = { payload, id: crypto.randomUUID() };
      }
      const created = await adminApi.createBatch({ entries, claimDays }, batchRequest.current.id);
      batchRequest.current = null;
      setResult(created);
      setCounts(EMPTY_COUNTS);
      await loadHistory();
    } catch (caught) {
      handleApiError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function revokeBatch(batch: InviteBatch) {
    if (
      !window.confirm(
        `确认撤销批次 ${batch.batchId.slice(0, 8)} 中 ${batch.activeCount} 个未使用邀请码？已兑换资格不会受影响。`,
      )
    ) {
      return;
    }
    setError("");
    try {
      await adminApi.revokeBatch(batch.batchId);
      await loadHistory(history?.pagination.page ?? 1);
    } catch (caught) {
      handleApiError(caught);
    }
  }

  return (
    <Shell admin={admin} onLogout={onLogout}>
      <main className="admin-main">
        <section className="admin-intro">
          <div>
            <p className="eyebrow">INVITE CONTROL</p>
            <h1>邀请码管理</h1>
            <p className="muted">生成不同资格规格的一次性邀请码，并查看批次状态与撤销记录。</p>
          </div>
          <div className="session-chip">
            <span />
            安全会话已验证
          </div>
        </section>

        <section className="generator-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW BATCH</p>
              <h2>新建批次</h2>
            </div>
            <strong className={total > 500 ? "total invalid" : "total"}>{total} / 500</strong>
          </div>
          <form onSubmit={createBatch}>
            <div className="tier-grid">
              {DURATION_TIERS.map((duration) => (
                <label className="tier-input" key={duration}>
                  <span>{duration} 天资格</span>
                  <input
                    aria-label={`${duration} 天邀请码数量`}
                    max={500}
                    min={0}
                    type="number"
                    value={counts[duration]}
                    onChange={(event) =>
                      setCounts((current) => ({
                        ...current,
                        [duration]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="generator-footer">
              <label className="claim-days">
                领取期限
                <span>
                  <input
                    max={90}
                    min={1}
                    required
                    type="number"
                    value={claimDays}
                    onChange={(event) => setClaimDays(Number(event.target.value))}
                  />
                  天
                </span>
              </label>
              <button
                className="button primary"
                disabled={busy || total < 1 || total > 500}
                type="submit"
              >
                <KeyRound size={17} />
                {busy ? "生成中…" : "生成邀请码"}
              </button>
            </div>
            {error && <p className="form-notice error">{error}</p>}
          </form>
        </section>

        {result && (
          <ResultsPanel batch={result.batch} codes={result.codes} onClear={() => setResult(null)} />
        )}
        <BatchHistory
          data={history}
          loading={historyBusy}
          onPage={(page) => void loadHistory(page)}
          onRevoke={(batch) => void revokeBatch(batch)}
        />
      </main>
    </Shell>
  );
}

function AdminPage() {
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    adminApi
      .session()
      .then((result) => {
        if (active) setAdmin(result.admin);
      })
      .catch(() => {
        if (active) setAdmin(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    try {
      await adminApi.logout();
    } finally {
      setAdmin(null);
    }
  }

  if (checking) {
    return (
      <Shell>
        <main className="loading-screen">
          <RefreshCw className="spin" />
          正在验证安全会话…
        </main>
      </Shell>
    );
  }
  if (!admin) {
    return (
      <Shell>
        <LoginPanel onLogin={setAdmin} />
      </Shell>
    );
  }
  return (
    <AdminDashboard
      admin={admin}
      onLogout={() => void logout()}
      onSessionExpired={() => setAdmin(null)}
    />
  );
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleNavigation = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  return path.startsWith("/admin") ? <AdminPage /> : <HomePage />;
}
