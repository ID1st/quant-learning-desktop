import type { AuthErrorCode } from "../../../../packages/shared/src/auth.ts";

export class AuthDomainError extends Error {
  public readonly code: AuthErrorCode;
  public readonly statusCode: number;
  public readonly retryAfterSeconds?: number;

  public constructor(
    code: AuthErrorCode,
    message: string,
    statusCode: number,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthDomainError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
