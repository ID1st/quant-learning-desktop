import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminProvisionConfig } from "../src/config.ts";
import { provisionAdminAccount } from "../src/services/adminService.ts";

test("admin provisioning normalizes the configured email and is idempotent", async () => {
  const observedEmails: string[] = [];
  const repository = {
    provisionAccount: async (email: string) => {
      observedEmails.push(email);
      return observedEmails.length === 1 ? ("CREATED" as const) : ("EXISTING" as const);
    },
  };

  assert.equal(
    await provisionAdminAccount(repository, "  Admin@Example.COM  "),
    "CREATED",
  );
  assert.equal(
    await provisionAdminAccount(repository, "admin@example.com"),
    "EXISTING",
  );
  assert.deepEqual(observedEmails, ["admin@example.com", "admin@example.com"]);
});

test("admin provisioning refuses to replace a different configured administrator", async () => {
  await assert.rejects(
    provisionAdminAccount(
      {
        provisionAccount: async () => "CONFLICT" as const,
      },
      "admin@example.com",
    ),
    /different administrator/u,
  );
});

test("admin provisioning configuration requires a database and valid email", () => {
  assert.deepEqual(
    loadAdminProvisionConfig({
      DATABASE_URL: "postgresql://quant-auth",
      AUTH_ADMIN_EMAIL: " Admin@Example.COM ",
    }),
    {
      databaseUrl: "postgresql://quant-auth",
      adminEmail: "admin@example.com",
    },
  );
  assert.throws(
    () => loadAdminProvisionConfig({ DATABASE_URL: "postgresql://quant-auth" }),
    /AUTH_ADMIN_EMAIL/u,
  );
  assert.throws(
    () =>
      loadAdminProvisionConfig({
        DATABASE_URL: "postgresql://quant-auth",
        AUTH_ADMIN_EMAIL: "invalid",
      }),
    /AUTH_ADMIN_EMAIL/u,
  );
});
