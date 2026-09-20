(() => {
  const root = document.getElementById("root");

  function showStartupMessage(title, detail) {
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
    root.append(container);
  }

  showStartupMessage("量化学习桌面版正在启动", "Quant Learning Desktop is starting…");

  window.addEventListener("error", (event) => {
    showStartupMessage(
      "界面启动失败 / Interface startup failed",
      event.message || "请重新启动应用；如果问题持续，请导出诊断信息。",
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const detail =
      event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    showStartupMessage(
      "界面启动失败 / Interface startup failed",
      detail || "请重新启动应用；如果问题持续，请导出诊断信息。",
    );
  });
})();
