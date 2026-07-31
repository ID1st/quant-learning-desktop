import { randomUUID } from "node:crypto";

import {
  ENTITLEMENT_DURATION_DAYS,
  type EntitlementDurationDays,
} from "../domain/authDomain.ts";
import type { InviteBatchStatus } from "../repositories/pgInviteBatchRepository.ts";
import {
  digestInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "../security/inviteCodes.ts";
import type { CreateInviteBatchRecord } from "./inviteBatchService.ts";

export interface AdminInviteRepository {
  createBatch(input: CreateInviteBatchRecord): Promise<void>;
  listBatches(input: {
    page: number;
    pageSize: number;
  }): Promise<{ items: InviteBatchStatus[]; totalItems: number }>;
  revokeBatch(batchId: string, now: Date): Promise<InviteBatchStatus | null>;
}

export interface AdminInviteBatchInput {
  entries: Array<{
    durationDays: EntitlementDurationDays;
    count: number;
  }>;
  claimDays: number;
}

export class AdminInviteError extends Error {
  public readonly statusCode: 400 | 404;

  public constructor(message: string, statusCode: 400 | 404) {
    super(message);
    this.name = "AdminInviteError";
    this.statusCode = statusCode;
  }
}

function validateBatchInput(input: AdminInviteBatchInput): number {
  if (!Number.isInteger(input.claimDays) || input.claimDays < 1 || input.claimDays > 90) {
    throw new AdminInviteError("claim days must be between 1 and 90", 400);
  }
  if (input.entries.length < 1 || input.entries.length > ENTITLEMENT_DURATION_DAYS.length) {
    throw new AdminInviteError(
      "invite batch must contain between one and four duration tiers",
      400,
    );
  }
  const durations = new Set<number>();
  let totalCount = 0;
  for (const entry of input.entries) {
    if (!ENTITLEMENT_DURATION_DAYS.some((duration) => duration === entry.durationDays)) {
      throw new AdminInviteError("duration must be one of 7, 30, 90 or 365 days", 400);
    }
    if (durations.has(entry.durationDays)) {
      throw new AdminInviteError("each duration tier must be unique", 400);
    }
    if (!Number.isInteger(entry.count) || entry.count < 1 || entry.count > 500) {
      throw new AdminInviteError("count must be between 1 and 500", 400);
    }
    durations.add(entry.durationDays);
    totalCount += entry.count;
  }
  if (totalCount > 500) {
    throw new AdminInviteError("invite batches cannot contain more than 500 codes", 400);
  }
  return totalCount;
}

export class AdminInviteService {
  private readonly pepper: string;
  private readonly repository: AdminInviteRepository;

  public constructor(input: {
    pepper: string;
    repository: AdminInviteRepository;
  }) {
    this.pepper = input.pepper;
    this.repository = input.repository;
  }

  public async createBatch(
    input: AdminInviteBatchInput,
    createdBy: string,
    now: Date,
  ): Promise<{
    batch: InviteBatchStatus;
    codes: Array<{
      inviteCode: string;
      durationDays: EntitlementDurationDays;
      claimExpiresAt: string;
    }>;
  }> {
    const totalCount = validateBatchInput(input);
    const batchId = randomUUID();
    const claimExpiresAt = new Date(
      now.getTime() + input.claimDays * 24 * 60 * 60 * 1_000,
    );
    const codes = input.entries.flatMap((entry) =>
      Array.from({ length: entry.count }, () => ({
        inviteCode: generateInviteCode(),
        durationDays: entry.durationDays,
      })),
    );

    await this.repository.createBatch({
      batchId,
      claimExpiresAt,
      createdAt: now,
      createdBy,
      codes: codes.map((code) => ({
        codeDigest: digestInviteCode(
          normalizeInviteCode(code.inviteCode),
          this.pepper,
        ),
        durationDays: code.durationDays,
        claimExpiresAt,
      })),
    });

    return {
      batch: {
        batchId,
        status: "ACTIVE",
        totalCount,
        activeCount: totalCount,
        redeemedCount: 0,
        revokedCount: 0,
        claimExpiresAt: claimExpiresAt.toISOString(),
        createdAt: now.toISOString(),
        revokedAt: null,
      },
      codes: codes.map((code) => ({
        ...code,
        claimExpiresAt: claimExpiresAt.toISOString(),
      })),
    };
  }

  public async listBatches(page: number, pageSize: number) {
    if (!Number.isInteger(page) || page < 1) {
      throw new AdminInviteError("page must be a positive integer", 400);
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new AdminInviteError("page size must be between 1 and 100", 400);
    }
    return this.repository.listBatches({ page, pageSize });
  }

  public async revokeBatch(batchId: string, now: Date): Promise<InviteBatchStatus> {
    const result = await this.repository.revokeBatch(batchId, now);
    if (!result) {
      throw new AdminInviteError("invite batch was not found", 404);
    }
    return result;
  }
}
