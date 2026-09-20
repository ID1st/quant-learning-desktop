(() => {
  const root = document.getElementById("root");
  let startupTimer;

  function retryWithoutCache() {
    const url = new URL(window.location.href);
    url.searchParams.set("startup-retry", `${Date.now()}`);
    window.location.replace(url.href);
  }

  function showStartupMessage(title, detail, retry = false) {
    if (!root) return;
    root.innerHTML = "";
    const container = document.createElement("main");
    container.dataset.rendererStartupGuard = "true";
    Object.assign(container.style, {
      minHeight: "100vh",
      display: "grid",
      placeContent: "center",
      gap: "10px",
      padding: "32px",
      color: "#f3f6ff",
      background: "#071019",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      textAlign: "center",
    });
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("span");
    description.textContent = detail;
    description.style.color = "#9aa8bd";
    container.append(heading, description);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "无缓存重试 / Retry without cache";
      Object.assign(button.style, {
        marginTop: "14px",
        padding: "10px 16px",
        color: "#f3f6ff",
        background: "#2463eb",
        border: "0",
        borderRadius: "8px",
        cursor: "pointer",
      });
      button.addEventListener("click", retryWithoutCache);
      container.append(button);
    }
    root.append(container);
  }

  function showFailure(detail) {
    window.clearTimeout(startupTimer);
    console.error(`[renderer-startup] failed: ${detail}`);
    showStartupMessage("界面启动失败 / Interface startup failed", detail, true);
  }

  showStartupMessage("量化学习桌面版正在启动", "Quant Learning Desktop is starting…");
  console.info("[renderer-startup] html-loaded");

  startupTimer = window.setTimeout(() => {
    showFailure("界面未能及时加载。请尝试无缓存重试，您的登录和研究数据不会被删除。");
  }, 15_000);

  window.addEventListener("quant-renderer-entry", () => {
    console.info("[renderer-startup] react-entry");
  });
  window.addEventListener("quant-renderer-mounted", () => {
    window.clearTimeout(startupTimer);
    console.info("[renderer-startup] react-mounted");
  });

  window.addEventListener("error", (event) => {
    showFailure(event.message || "请重新启动应用；如果问题持续，请导出诊断信息。");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const detail =
      event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    showFailure(detail || "请重新启动应用；如果问题持续，请导出诊断信息。");
  });
})();
