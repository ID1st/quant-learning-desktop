import nodemailer, { type Transporter } from "nodemailer";
import type { Pool } from "pg";

import type { CloudAuthConfig } from "../config.ts";

interface OutboxMessage {
  id: string;
  toEmail: string;
  template: "registration-code" | "password-reset-code";
  payload: {
    code: string;
    expiresInMinutes: number;
  };
  attemptCount: number;
  claimToken: string;
}

const POLL_INTERVAL_MILLISECONDS = 2_000;
const MAX_ATTEMPTS = 8;
const LEASE_SECONDS = 120;

async function claimNextMessage(pool: Pool): Promise<OutboxMessage | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      to_email: string;
      template: OutboxMessage["template"];
      payload: OutboxMessage["payload"];
      attempt_count: number;
      claim_token: string;
    }>(
      `
        WITH expired_terminal AS (
          UPDATE email_outbox
          SET
            status = 'FAILED',
            payload = '{}'::jsonb,
            last_error = 'DELIVERY_FAILED:FINAL_LEASE_EXPIRED',
            claim_token = NULL,
            claimed_at = NULL,
            lease_expires_at = NULL
          WHERE status = 'SENDING'
            AND lease_expires_at <= now()
            AND attempt_count >= $1
          RETURNING id
        ),
        candidate AS (
          SELECT id
          FROM email_outbox
          WHERE (
              (
                status IN ('PENDING', 'FAILED')
                AND next_attempt_at <= now()
              )
              OR (
                status = 'SENDING'
                AND (
                  lease_expires_at IS NULL
                  OR lease_expires_at <= now()
                )
              )
            )
            AND attempt_count < $1
          ORDER BY created_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE email_outbox AS outbox
        SET
          status = 'SENDING',
          attempt_count = attempt_count + 1,
          claim_token = gen_random_uuid(),
          claimed_at = now(),
          lease_expires_at = now() + ($2 * interval '1 second')
        FROM candidate
        WHERE outbox.id = candidate.id
        RETURNING
          outbox.id,
          outbox.to_email,
          outbox.template,
          outbox.payload,
          outbox.attempt_count,
          outbox.claim_token
      `,
      [MAX_ATTEMPTS, LEASE_SECONDS],
    );
    await client.query("COMMIT");
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      toEmail: row.to_email,
      template: row.template,
      payload: row.payload,
      attemptCount: row.attempt_count,
      claimToken: row.claim_token,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function validateMessage(message: OutboxMessage): void {
  if (
    !/^\d{6}$/.test(message.payload.code) ||
    message.payload.expiresInMinutes !== 10 ||
    (message.template !== "registration-code" &&
      message.template !== "password-reset-code")
  ) {
    throw new Error("email outbox payload is invalid");
  }
}

function renderMessage(message: OutboxMessage): {
  subject: string;
  text: string;
  html: string;
} {
  validateMessage(message);
  const purpose =
    message.template === "registration-code" ? "注册" : "重置密码";
  const subject = `量化学习系统${purpose}验证码`;
  const text = `您的${purpose}验证码为：${message.payload.code}。验证码 10 分钟内有效，请勿转发。`;
  const html = [
    "<p>您好：</p>",
    `<p>您的${purpose}验证码为：</p>`,
    `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${message.payload.code}</p>`,
    "<p>验证码 10 分钟内有效，请勿转发。如果不是您本人操作，请忽略本邮件。</p>",
  ].join("");
  return { subject, text, html };
}

function safeDeliveryError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "DELIVERY_FAILED";
  }
  const record = error as Record<string, unknown>;
  const code =
    typeof record.code === "string" &&
    /^[A-Za-z0-9_.-]{1,40}$/.test(record.code)
      ? record.code
      : "UNKNOWN";
  const responseCode =
    Number.isInteger(record.responseCode) &&
    Number(record.responseCode) >= 100 &&
    Number(record.responseCode) <= 999
      ? `:${Number(record.responseCode)}`
      : "";
  return `DELIVERY_FAILED:${code}${responseCode}`;
}

export class EmailOutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly pool: Pool;
  private readonly transporter: Transporter;
  private readonly from: string;

  public constructor(
    pool: Pool,
    transporter: Transporter,
    from: string,
  ) {
    this.pool = pool;
    this.transporter = transporter;
    this.from = from;
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.drainOnce();
    }, POLL_INTERVAL_MILLISECONDS);
    this.timer.unref();
    void this.drainOnce();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async drainOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (let index = 0; index < 10; index += 1) {
        const message = await claimNextMessage(this.pool);
        if (!message) {
          break;
        }

        try {
          const rendered = renderMessage(message);
          await this.transporter.sendMail({
            from: this.from,
            to: message.toEmail,
            messageId: `<outbox-${message.id}@quant-learning.local>`,
            ...rendered,
          });
          await this.pool.query(
            `
              UPDATE email_outbox
              SET
                status = 'SENT',
                payload = '{}'::jsonb,
                sent_at = now(),
                last_error = NULL,
                claim_token = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL
              WHERE id = $1
                AND claim_token = $2
                AND status = 'SENDING'
            `,
            [message.id, message.claimToken],
          );
        } catch (error) {
          const retryDelayMinutes = Math.min(
            2 ** message.attemptCount,
            60,
          );
          await this.pool.query(
            `
              UPDATE email_outbox
              SET
                status = 'FAILED',
                payload = CASE
                  WHEN $4 THEN '{}'::jsonb
                  ELSE payload
                END,
                last_error = $2,
                next_attempt_at = now() + ($3 * interval '1 minute'),
                claim_token = NULL,
                claimed_at = NULL,
                lease_expires_at = NULL
              WHERE id = $1
                AND claim_token = $5
                AND status = 'SENDING'
            `,
            [
              message.id,
              safeDeliveryError(error),
              retryDelayMinutes,
              message.attemptCount >= MAX_ATTEMPTS,
              message.claimToken,
            ],
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export function createEmailOutboxWorker(
  pool: Pool,
  smtp: NonNullable<CloudAuthConfig["smtp"]>,
): EmailOutboxWorker {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
  });
  return new EmailOutboxWorker(pool, transporter, smtp.from);
}
