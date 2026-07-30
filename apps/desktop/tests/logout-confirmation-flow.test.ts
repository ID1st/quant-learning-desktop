import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all workspace logout triggers use the shared confirmation dialog", async () => {
  const [settings, shell, dialog] = await Promise.all([
    readFile(
      new URL("../src/pages/SettingsPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/layouts/AppShell.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/features/auth/LogoutConfirmationDialog.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(settings, /<LogoutConfirmationDialog/u);
  assert.match(settings, /setIsLogoutConfirmOpen\(true\)/u);
  assert.doesNotMatch(
    settings,
    /onClick=\{\(\) => void handleAccountLogout\(\)\}/u,
  );
  assert.match(shell, /returnFocusRef=\{logoutButtonRef\}/u);
  assert.match(settings, /returnFocusRef=\{logoutButtonRef\}/u);
  assert.match(dialog, /returnFocusRef\?:/u);
  assert.match(dialog, /returnFocusRef\.current\?\.focus\(\)/u);
});
