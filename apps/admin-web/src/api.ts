import type { DurationTier, InviteCodeResult } from "./inviteExport.ts";

export interface AdminIdentity {
  email: string;
}

export interface InviteBatch {
  batchId: string;
  status: "ACTIVE" | "REVOKED";
  totalCount: number;
  activeCount: number;
  redeemedCount: number;
  revokedCount: number;
  claimExpiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface BatchPage {
  items: InviteBatch[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface Envelope<T> {
  data: T;
}

export class AdminApiError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    Envelope<T> | { message?: string } | null;
  if (!response.ok) {
    const message =
      payload && "message" in payload && payload.message
        ? payload.message
        : response.status === 401
          ? "管理员会话已失效，请重新登录。"
          : "请求未完成，请稍后重试。";
    throw new AdminApiError(message, response.status);
  }
  if (!payload || !("data" in payload)) {
    throw new AdminApiError("服务返回了无法识别的数据。", 502);
  }
  return payload.data;
}

export const adminApi = {
  requestLoginCode(email: string) {
    return request<{ accepted: boolean }>("/login-code-requests", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  login(email: string, code: string) {
    return request<{ admin: AdminIdentity }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },
  session() {
    return request<{ admin: AdminIdentity }>("/session");
  },
  logout() {
    return request<{ loggedOut: boolean }>("/session", { method: "DELETE" });
  },
  createBatch(input: {
    claimDays: number;
    entries: Array<{ durationDays: DurationTier; count: number }>;
  }) {
    return request<{ batch: InviteBatch; codes: InviteCodeResult[] }>("/invite-batches", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  listBatches(page: number) {
    return request<BatchPage>(`/invite-batches?page=${page}&pageSize=20`);
  },
  revokeBatch(batchId: string) {
    return request<InviteBatch>(`/invite-batches/${batchId}/revocations`, {
      method: "POST",
    });
  },
};
