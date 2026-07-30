import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cloud deployment backs up and migrates before activating the candidate", async () => {
  const script = await readFile(
    new URL("../../../deploy/cloud/scripts/deploy-release.sh", import.meta.url),
    "utf8",
  );
  const buildIndex = script.indexOf("build auth migrate");
  const backupIndex = script.indexOf("postgres-backup.sh");
  const migrationIndex = script.indexOf("run --rm --no-deps migrate");
  const activationIndex = script.indexOf('mv -Tf "${next_link}" "${current_link}"');
  const authStartIndex = script.indexOf("up -d --no-deps auth");

  assert.ok(buildIndex >= 0);
  assert.ok(buildIndex < backupIndex);
  assert.ok(backupIndex < migrationIndex);
  assert.ok(migrationIndex < activationIndex);
  assert.ok(activationIndex < authStartIndex);
});

test("cloud image bundles migrations and auth waits for the migrator", async () => {
  const [dockerfile, compose] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../../../deploy/cloud/docker-compose.yml", import.meta.url), "utf8"),
  ]);

  assert.match(dockerfile, /COPY apps\/cloud-server\/migrations apps\/cloud-server\/migrations/u);
  assert.match(compose, /migrate:/u);
  assert.match(compose, /condition: service_completed_successfully/u);
});
