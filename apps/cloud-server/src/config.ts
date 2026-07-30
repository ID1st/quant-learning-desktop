export interface CloudAuthConfig {
  host: string;
  port: number;
  databaseUrl: string;
  inviteCodePepper: string;
  tokenPepper: string;
  emailCodePepper: string;
  loginChallengeSecret: string;
  offlineLeasePrivateKeyPem: string;
  offlineLeasePublicKeyPem: string;
  inviteExportDirectory: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  } | null;
}

function requireEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
  minimumBytes = 1,
): string {
  const value = environment[name]?.trim() ?? "";
  if (Buffer.byteLength(value, "utf8") < minimumBytes) {
    throw new Error(`${name} is required and must contain at least ${minimumBytes} bytes`);
  }
  return value.replaceAll("\\n", "\n");
}

function parsePort(rawValue: string | undefined, fallback: number, name: string): number {
  const port = rawValue ? Number(rawValue) : fallback;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return port;
}

export function loadCloudAuthConfig(environment: NodeJS.ProcessEnv = process.env): CloudAuthConfig {
  const smtpHost = environment.AUTH_SMTP_HOST?.trim() ?? "";
  const smtp = smtpHost
    ? {
        host: smtpHost,
        port: parsePort(environment.AUTH_SMTP_PORT, 587, "AUTH_SMTP_PORT"),
        secure: environment.AUTH_SMTP_SECURE === "true",
        user: requireEnvironmentValue(environment, "AUTH_SMTP_USER"),
        password: requireEnvironmentValue(environment, "AUTH_SMTP_PASSWORD"),
        from: requireEnvironmentValue(environment, "AUTH_SMTP_FROM"),
      }
    : null;

  return {
    host: environment.AUTH_HOST?.trim() || "127.0.0.1",
    port: parsePort(environment.AUTH_PORT, 8787, "AUTH_PORT"),
    databaseUrl: requireEnvironmentValue(environment, "DATABASE_URL"),
    inviteCodePepper: requireEnvironmentValue(environment, "AUTH_INVITE_CODE_PEPPER", 32),
    tokenPepper: requireEnvironmentValue(environment, "AUTH_TOKEN_PEPPER", 32),
    emailCodePepper: requireEnvironmentValue(environment, "AUTH_EMAIL_CODE_PEPPER", 32),
    loginChallengeSecret: requireEnvironmentValue(environment, "AUTH_LOGIN_CHALLENGE_SECRET", 32),
    offlineLeasePrivateKeyPem: requireEnvironmentValue(environment, "AUTH_OFFLINE_PRIVATE_KEY_PEM"),
    offlineLeasePublicKeyPem: requireEnvironmentValue(environment, "AUTH_OFFLINE_PUBLIC_KEY_PEM"),
    inviteExportDirectory:
      environment.AUTH_INVITE_EXPORT_DIR?.trim() || "/opt/quant-auth/secrets/invite-exports",
    smtp,
  };
}

export function loadInviteCliConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Pick<CloudAuthConfig, "databaseUrl" | "inviteCodePepper" | "inviteExportDirectory"> {
  return {
    databaseUrl: requireEnvironmentValue(environment, "DATABASE_URL"),
    inviteCodePepper: requireEnvironmentValue(environment, "AUTH_INVITE_CODE_PEPPER", 32),
    inviteExportDirectory:
      environment.AUTH_INVITE_EXPORT_DIR?.trim() || "/opt/quant-auth/secrets/invite-exports",
  };
}
