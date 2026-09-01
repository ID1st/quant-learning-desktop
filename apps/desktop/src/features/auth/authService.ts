import { formatInviteCode, type AuthErrorCode, type QuantDesktopAuthBridge } from "@quant/shared";

export interface PasswordRuleState {
  length: boolean;
  lowercase: boolean;
  uppercase: boolean;
  digit: boolean;
  special: boolean;
  asciiNoWhitespace: boolean;
}

const authErrorMessages: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: "邮箱或密码不正确。",
  EMAIL_CODE_INVALID: "邮箱验证码不正确，请重新输入。",
  EMAIL_CODE_EXPIRED: "邮箱验证码已过期，请重新获取。",
  ACCOUNT_ALREADY_EXISTS: "该邮箱已注册，请直接登录；如忘记密码，请重置密码。",
  INVITE_INVALID: "邀请码无效，请核对后重试。",
  INVITE_EXPIRED: "邀请码已超过领取期限，请获取新的邀请码。",
  INVITE_ALREADY_REDEEMED: "该邀请码已经被使用，请获取新的邀请码。",
  ENTITLEMENT_EXPIRED: "测试资格已到期，请使用新的邀请码续期。",
  SESSION_REVOKED: "当前会话已失效，请重新登录。",
  DEVICE_LIMIT_REACHED: "账号活跃设备已达到上限。",
  PASSWORD_POLICY_FAILED: "密码未满足全部安全规则。",
  RATE_LIMITED: "操作过于频繁，请稍后再试。",
  NETWORK_UNAVAILABLE: "当前网络不可用，无法连接账号验证服务。",
  SERVICE_UNAVAILABLE: "账号验证服务暂时不可用，请稍后重试。",
  ACCESS_DENIED: "当前操作未获授权。",
};

export function getAuthBridge(): QuantDesktopAuthBridge | null {
  return window.quantDesktop?.auth ?? null;
}

export function authErrorMessage(code: AuthErrorCode, retryAfterSeconds?: number): string {
  if (code === "RATE_LIMITED" && retryAfterSeconds) {
    return `操作过于频繁，请在 ${retryAfterSeconds} 秒后重试。`;
  }
  return authErrorMessages[code];
}

export function evaluatePasswordRules(password: string): PasswordRuleState {
  return {
    length: password.length >= 8 && password.length <= 64,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    digit: /\d/.test(password),
    special: /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(password),
    asciiNoWhitespace: /^[\x21-\x7e]+$/.test(password),
  };
}

export function passwordRulesSatisfied(password: string): boolean {
  return Object.values(evaluatePasswordRules(password)).every(Boolean);
}

export function normalizeInviteInput(inviteCode: string): string {
  return formatInviteCode(inviteCode);
}

export function renewalCredentialsRequired(verifiedEmail: string, enteredEmail: string): boolean {
  const normalizedVerifiedEmail = verifiedEmail.trim().toLowerCase();
  return (
    normalizedVerifiedEmail.length === 0 ||
    enteredEmail.trim().toLowerCase() !== normalizedVerifiedEmail
  );
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return email;
  }
  const visible = localPart.slice(0, Math.min(2, localPart.length));
  return `${visible}${"*".repeat(Math.max(3, localPart.length - visible.length))}@${domain}`;
}
