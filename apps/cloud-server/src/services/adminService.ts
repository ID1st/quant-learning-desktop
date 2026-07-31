import { normalizeEmailAddress } from "../security/emailAddresses.ts";

export type AdminProvisionResult = "CREATED" | "EXISTING";

export interface AdminProvisionRepository {
  provisionAccount(
    email: string,
    now: Date,
  ): Promise<AdminProvisionResult | "CONFLICT">;
}

export async function provisionAdminAccount(
  repository: AdminProvisionRepository,
  rawEmail: string,
  now = new Date(),
): Promise<AdminProvisionResult> {
  const result = await repository.provisionAccount(normalizeEmailAddress(rawEmail), now);
  if (result === "CONFLICT") {
    throw new Error("a different administrator is already provisioned");
  }
  return result;
}
