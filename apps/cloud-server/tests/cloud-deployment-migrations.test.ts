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

test("cloud deployment provisions the administrator and atomically activates the web console", async () => {
  const [deployScript, buildScript, nginx] = await Promise.all([
    readFile(new URL("../../../deploy/cloud/scripts/deploy-release.sh", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/build-cloud-release.ps1", import.meta.url), "utf8"),
    readFile(
      new URL("../../../deploy/cloud/nginx/quant-auth.conf.template", import.meta.url),
      "utf8",
    ),
  ]);

  const migrationIndex = deployScript.indexOf("run --rm --no-deps migrate");
  const provisionIndex = deployScript.indexOf("adminProvision.js");
  const authStartIndex = deployScript.indexOf("up -d --no-deps auth");
  const siteActivationIndex = deployScript.indexOf(
    'mv -Tf "${site_next_link}" "${site_current_link}"',
  );

  assert.ok(migrationIndex >= 0);
  assert.ok(migrationIndex < provisionIndex);
  assert.ok(provisionIndex < authStartIndex);
  assert.ok(authStartIndex < siteActivationIndex);
  assert.match(buildScript, /build:admin-web/u);
  assert.match(buildScript, /apps\/admin-web\/dist/u);
  assert.match(nginx, /location \^~ \/api\/admin\//u);
  assert.match(nginx, /rewrite \^\/api\/admin\/\(\.\*\)\$ \/v1\/admin\/\$1 break;/u);
  assert.match(nginx, /location \^~ \/v1\/admin\/\s*\{\s*return 404;/u);
  assert.match(nginx, /root \/var\/www\/fnndp\.xyz\/current;/u);
});
