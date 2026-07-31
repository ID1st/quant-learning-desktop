import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import test from "node:test";

import {
  containsDiagnosticSecrets,
  createLocalCrashReporterOptions,
  createTarGzip,
  redactDiagnosticText,
} from "../src/electron/diagnosticsCore.ts";

test("diagnostic text redaction removes credentials, emails and verification codes", () => {
  const source = [
    "email=person@example.com",
    "Authorization: Bearer header.payload.signature",
    'refresh_token="rotating-refresh-secret"',
    "验证码: 482913",
    "safe=renderer crashed",
  ].join("\n");

  const redacted = redactDiagnosticText(source);

  assert.doesNotMatch(redacted, /person@example\.com/u);
  assert.doesNotMatch(redacted, /header\.payload\.signature/u);
  assert.doesNotMatch(redacted, /rotating-refresh-secret/u);
  assert.doesNotMatch(redacted, /482913/u);
  assert.match(redacted, /renderer crashed/u);
  assert.match(redacted, /\[REDACTED_EMAIL\]/u);
});

test("minidump safety scan detects ASCII and UTF-16 credential material", () => {
  assert.equal(
    containsDiagnosticSecrets(Buffer.from("Authorization: Bearer live-secret-value")),
    true,
  );
  assert.equal(containsDiagnosticSecrets(Buffer.from("person@example.com", "utf16le")), true);
  assert.equal(containsDiagnosticSecrets(Buffer.from([0, 1, 2, 3, 4, 5])), false);
});

test("diagnostic archive is gzip-compressed tar and rejects traversal paths", () => {
  const archive = createTarGzip([
    {
      path: "manifest.json",
      data: Buffer.from('{"ok":true}', "utf8"),
      modifiedAt: new Date("2026-07-30T00:00:00.000Z"),
    },
  ]);
  const tar = gunzipSync(archive);

  assert.equal(tar.subarray(0, "manifest.json".length).toString("utf8"), "manifest.json");
  assert.match(tar.subarray(512, 523).toString("utf8"), /\{"ok":true\}/u);
  assert.throws(
    () =>
      createTarGzip([
        {
          path: "../secret.txt",
          data: Buffer.from("no"),
        },
      ]),
    /archive path/u,
  );
});

test("Crashpad is configured for local-only collection before renderer startup", () => {
  assert.deepEqual(createLocalCrashReporterOptions("candidate"), {
    productName: "Quant Learning Desktop",
    uploadToServer: false,
    compress: false,
    globalExtra: { releaseChannel: "candidate" },
  });
  assert.equal("submitURL" in createLocalCrashReporterOptions("https://unsafe.example"), false);
  assert.equal(
    createLocalCrashReporterOptions("https://unsafe.example").globalExtra.releaseChannel,
    "local",
  );
});
