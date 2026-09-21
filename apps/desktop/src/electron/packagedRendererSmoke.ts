export function createPackagedRendererSmokeScript(timeoutMilliseconds = 15_000) {
  return `(async () => {
    const deadline = Date.now() + ${timeoutMilliseconds};
    let phase = null;
    let loginShownWhileRestoring = false;
    do {
      const root = document.getElementById("root");
      const guard = document.querySelector("[data-renderer-startup-guard]");
      phase = document.querySelector("[data-desktop-auth-phase]")?.getAttribute("data-desktop-auth-phase") ?? null;
      const usablePhase = ["SIGNED_OUT", "AUTHENTICATED_ONLINE", "AUTHENTICATED_OFFLINE"].includes(phase);
      const control = root?.querySelector("button:not([disabled]), input:not([disabled])");
      if (phase === "BOOTSTRAPPING" && control && !guard) loginShownWhileRestoring = true;
      if (usablePhase && control && !guard && root?.innerText.trim()) {
        return { ok: true, title: document.title, phase, loginShownWhileRestoring };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return { ok: false, title: document.title, phase, error: "No usable authenticated workspace or sign-in form." };
  })()`;
}
