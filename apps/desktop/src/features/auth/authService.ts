export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  confirmPassword: string;
  inviteCode: string;
  emailCode: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  apiBound: boolean;
  createdAt: string;
}

const VALID_EMAIL_CODE = "123456";
const VALID_INVITE_CODE = "QUANT2026";

function waitForNetworkBoundary() {
  return new Promise((resolve) => window.setTimeout(resolve, 320));
}

function ensureEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("请输入有效的邮箱地址。");
  }
}

function ensurePassword(password: string) {
  if (password.length < 8) {
    throw new Error("密码至少需要 8 位。");
  }
}

export async function sendEmailCode(email: string): Promise<void> {
  ensureEmail(email);
  await waitForNetworkBoundary();
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  ensureEmail(payload.email);
  ensurePassword(payload.password);
  await waitForNetworkBoundary();

  return {
    userId: `local-${payload.email}`,
    email: payload.email,
    apiBound: false,
    createdAt: new Date().toISOString(),
  };
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  ensureEmail(payload.email);
  ensurePassword(payload.password);

  if (payload.password !== payload.confirmPassword) {
    throw new Error("两次输入的密码不一致。");
  }

  await waitForNetworkBoundary();

  if (payload.inviteCode.trim().toUpperCase() !== VALID_INVITE_CODE) {
    throw new Error("邀请码验证失败。当前占位验证码为 QUANT2026。");
  }

  if (payload.emailCode.trim() !== VALID_EMAIL_CODE) {
    throw new Error("邮箱验证码错误。当前占位验证码为 123456。");
  }

  return {
    userId: `local-${payload.email}`,
    email: payload.email,
    apiBound: false,
    createdAt: new Date().toISOString(),
  };
}
