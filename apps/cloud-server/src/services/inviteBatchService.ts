import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseInviteBatchArguments, type EntitlementDurationDays } from "../domain/authDomain.ts";
import {
  digestInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from "../security/inviteCodes.ts";

export interface PersistedInviteCode {
  codeDigest: Buffer;
  durationDays: EntitlementDurationDays;
  claimExpiresAt: Date;
}

export interface CreateInviteBatchRecord {
  batchId: string;
  claimExpiresAt: Date;
  codes: PersistedInviteCode[];
  createdAt: Date;
  createdBy: string;
}

export interface InviteBatchRepository {
  createBatch(input: CreateInviteBatchRecord): Promise<void>;
}

export interface CreateInviteBatchExportInput {
  argumentsList: string[];
  createdBy: string;
  now: Date;
  outputDirectory: string;
  pepper: string;
  repository: InviteBatchRepository;
}

export interface InviteBatchExportResult {
  batchId: string;
  totalCount: number;
  filePath: string;
  checksumSha256: string;
}

interface GeneratedInviteCode {
  plaintextCode: string;
  durationDays: EntitlementDurationDays;
}

const INVITE_EXPORT_MAX_AGE_MILLISECONDS = 24 * 60 * 60 * 1_000;

function generateUniqueCodes(
  entries: ReturnType<typeof parseInviteBatchArguments>["entries"],
): GeneratedInviteCode[] {
  const seenCodes = new Set<string>();
  const codes: GeneratedInviteCode[] = [];

  for (const entry of entries) {
    for (let index = 0; index < entry.count; index += 1) {
      const plaintextCode = generateInviteCode();
      const normalizedCode = normalizeInviteCode(plaintextCode);
      if (seenCodes.has(normalizedCode)) {
        index -= 1;
        continue;
      }

      seenCodes.add(normalizedCode);
      codes.push({ plaintextCode, durationDays: entry.durationDays });
    }
  }

  return codes;
}

function buildCsv(batchId: string, claimExpiresAt: Date, codes: GeneratedInviteCode[]): string {
  const rows = codes.map((code) =>
    [batchId, code.plaintextCode, code.durationDays, claimExpiresAt.toISOString()].join(","),
  );

  return ["batch_id,invite_code,duration_days,claim_expires_at", ...rows, ""].join("\n");
}

export async function createInviteBatchExport(
  input: CreateInviteBatchExportInput,
): Promise<InviteBatchExportResult> {
  const argumentsResult = parseInviteBatchArguments(input.argumentsList);
  const batchId = randomUUID();
  const claimExpiresAt = new Date(
    input.now.getTime() + argumentsResult.claimDays * 24 * 60 * 60 * 1_000,
  );
  const codes = generateUniqueCodes(argumentsResult.entries);
  const csv = buildCsv(batchId, claimExpiresAt, codes);
  const checksumSha256 = createHash("sha256").update(csv, "utf8").digest("hex");

  await mkdir(input.outputDirectory, {
    recursive: true,
    mode: 0o700,
  });
  const filePath = join(input.outputDirectory, `invite-batch-${batchId}.csv`);
  await writeFile(filePath, csv, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(filePath, 0o600);

  try {
    await input.repository.createBatch({
      batchId,
      claimExpiresAt,
      codes: codes.map((code) => ({
        codeDigest: digestInviteCode(normalizeInviteCode(code.plaintextCode), input.pepper),
        durationDays: code.durationDays,
        claimExpiresAt,
      })),
      createdAt: input.now,
      createdBy: input.createdBy,
    });
  } catch (error) {
    await unlink(filePath).catch(() => undefined);
    throw error;
  }

  return {
    batchId,
    totalCount: argumentsResult.totalCount,
    filePath,
    checksumSha256,
  };
}

export async function cleanupExpiredInviteExports(
  outputDirectory: string,
  now: Date,
): Promise<number> {
  const entries = await readdir(outputDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  let removedCount = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !/^invite-batch-[0-9a-f-]{36}\.csv$/.test(entry.name)) {
      continue;
    }

    const filePath = join(outputDirectory, entry.name);
    const fileStats = await stat(filePath);
    if (now.getTime() - fileStats.mtime.getTime() < INVITE_EXPORT_MAX_AGE_MILLISECONDS) {
      continue;
    }

    await unlink(filePath);
    removedCount += 1;
  }

  return removedCount;
}
