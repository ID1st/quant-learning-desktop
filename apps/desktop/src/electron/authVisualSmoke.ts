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
  "LOGOUT_CONFIRMATION",
  "WORKSPACE_SCROLL",
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
  window.webContents.on("console-message", (_event, level, message, _line, sourceId) => {
    if (level >= 2) {
      consoleProblems.push(`${sourceId}: ${message}`);
    }
  });

  const checks: Array<{
    phase: string;
    width: number;
    height: number;
    pageFits: boolean;
    cardFits: boolean;
    labeledInputs: boolean;
    mainContentScrolls: boolean;
    primaryActionReachable: boolean;
    sidebarFits: boolean;
    focusRestored: boolean;
    logoutFocusDetail: string;
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
            (async () => {
              await new Promise((resolve) =>
                window.requestAnimationFrame(() =>
                  window.requestAnimationFrame(resolve)
                )
              );
              const root = document.documentElement;
              const isLogoutConfirmation = ${JSON.stringify(phase)} === "LOGOUT_CONFIRMATION";
              const isWorkspaceScroll = ${JSON.stringify(phase)} === "WORKSPACE_SCROLL";
              const card = document.querySelector(
                isLogoutConfirmation
                  ? ".logout-confirmation-dialog"
                  : isWorkspaceScroll
                    ? ".app-shell"
                    : ".auth-card"
              );
              const primaryAction = document.querySelector(
                isLogoutConfirmation
                  ? ".logout-confirm-action"
                  : isWorkspaceScroll
                    ? ".logout-button"
                    : ".primary-auth-action"
              );
              const cardRect = card?.getBoundingClientRect();
              const primaryActionRect = primaryAction?.getBoundingClientRect();
              const appContent = document.querySelector(".app-content");
              const sidebarRect = document
                .querySelector(".app-sidebar")
                ?.getBoundingClientRect();
              const inputs = [...document.querySelectorAll("input")];
              let focusRestored = true;
              let logoutFocusDetail = "not-applicable";
              if (isLogoutConfirmation) {
                const cancelAction = document.querySelector(".logout-cancel-action");
                const initialFocusIsCorrect = document.activeElement === cancelAction;
                window.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    bubbles: true,
                    key: "Escape"
                  })
                );
                await new Promise((resolve) =>
                  window.requestAnimationFrame(() =>
                    window.requestAnimationFrame(resolve)
                  )
                );
                const dialogClosed =
                  !document.querySelector(".logout-confirmation-dialog");
                const triggerFocused =
                  document.activeElement ===
                  document.querySelector(".logout-button");
                focusRestored =
                  initialFocusIsCorrect && dialogClosed && triggerFocused;
                logoutFocusDetail = JSON.stringify({
                  activeElementClass:
                    document.activeElement?.getAttribute("class") ?? null,
                  dialogClosed,
                  initialFocusIsCorrect,
                  triggerFocused
                });
              }
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
                mainContentScrolls:
                  !isWorkspaceScroll ||
                  appContent.scrollHeight > appContent.clientHeight,
                primaryActionReachable:
                  Boolean(primaryAction) &&
                  Boolean(card) &&
                  (isLogoutConfirmation || isWorkspaceScroll
                    ? primaryActionRect.top >= cardRect.top &&
                      primaryActionRect.bottom <= cardRect.bottom + 1
                    : card.scrollHeight >=
                      primaryAction.offsetTop + primaryAction.offsetHeight),
                sidebarFits:
                  !isWorkspaceScroll ||
                  (Boolean(sidebarRect) &&
                    sidebarRect.top >= 0 &&
                    sidebarRect.bottom <= window.innerHeight + 1),
                focusRestored,
                logoutFocusDetail
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
          check.mainContentScrolls &&
          check.primaryActionReachable &&
          check.sidebarFits &&
          check.focusRestored,
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
            !check.mainContentScrolls ||
            !check.primaryActionReachable ||
            !check.sidebarFits ||
            !check.focusRestored,
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
