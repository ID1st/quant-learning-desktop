import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const phases = [
  "LOGIN",
  "REGISTERING",
  "INVITE_REQUIRED",
  "ENTITLEMENT_EXPIRED",
  "RESET_REQUEST",
  "RESET_PASSWORD",
  "SERVICE_UNAVAILABLE",
] as const;
const viewports = [
  { width: 1180, height: 760 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

void app.whenReady().then(async () => {
  const rendererEntry = join(__dirname, "../renderer/index.html");
  const window = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: 1180,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const consoleProblems: string[] = [];
  window.webContents.on(
    "console-message",
    (_event, level, message, _line, sourceId) => {
      if (level >= 2) {
        consoleProblems.push(`${sourceId}: ${message}`);
      }
    },
  );

  const checks: Array<{
    phase: string;
    width: number;
    height: number;
    pageFits: boolean;
    cardFits: boolean;
    labeledInputs: boolean;
    primaryActionReachable: boolean;
  }> = [];

  try {
    for (const viewport of viewports) {
      window.setContentSize(viewport.width, viewport.height);
      for (const phase of phases) {
        await window.loadFile(rendererEntry, {
          query: { "auth-visual-qa": phase },
        });
        const result = await window.webContents.executeJavaScript(
          `
            (() => {
              const root = document.documentElement;
              const card = document.querySelector(".auth-card");
              const cardRect = card?.getBoundingClientRect();
              const inputs = [...document.querySelectorAll("input")];
              const primaryAction = document.querySelector(".primary-auth-action");
              return {
                pageFits:
                  root.scrollWidth <= window.innerWidth + 1 &&
                  root.scrollHeight <= window.innerHeight + 1,
                cardFits:
                  Boolean(cardRect) &&
                  cardRect.left >= 0 &&
                  cardRect.right <= window.innerWidth + 1 &&
                  cardRect.top >= 0 &&
                  cardRect.bottom <= window.innerHeight + 1,
                labeledInputs: inputs.every((input) => Boolean(input.closest("label"))),
                primaryActionReachable:
                  Boolean(primaryAction) &&
                  Boolean(card) &&
                  card.scrollHeight >= primaryAction.offsetTop + primaryAction.offsetHeight
              };
            })()
          `,
          true,
        );
        checks.push({ phase, ...viewport, ...result });
      }
    }

    const ok =
      consoleProblems.length === 0 &&
      checks.every(
        (check) =>
          check.pageFits &&
          check.cardFits &&
          check.labeledInputs &&
          check.primaryActionReachable,
      );
    console.log(
      JSON.stringify({
        ok,
        checks: checks.length,
        failures: checks.filter(
          (check) =>
            !check.pageFits ||
            !check.cardFits ||
            !check.labeledInputs ||
            !check.primaryActionReachable,
        ),
        consoleProblems,
      }),
    );
    app.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    window.destroy();
  }
});
