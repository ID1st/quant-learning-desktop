import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { app, BrowserWindow } from "electron";

const previewUrl = process.env.ML_VISUAL_QA_URL ?? "http://127.0.0.1:5174/?ml-price-targets-visual-qa=1";
const outputDirectory = resolve("data/tmp");
const implementationPath = resolve(outputDirectory, "ml-price-targets-visual-qa.png");
const comparisonPath = resolve(outputDirectory, "ml-price-targets-visual-comparison.png");
const referencePath = resolve(
  process.env.ML_VISUAL_REFERENCE ??
    "C:/Users/Admin/AppData/Local/Temp/codex-clipboard-af925471-32e6-45c1-bb13-c588f70ca671.png",
);

app.commandLine.appendSwitch("force-device-scale-factor", "1");

void app.whenReady().then(async () => {
  await mkdir(outputDirectory, { recursive: true });
  const consoleErrors = [];
  const consoleWarnings = [];
  const window = new BrowserWindow({
    width: 2026,
    height: 806,
    frame: false,
    show: false,
    useContentSize: true,
    webPreferences: { sandbox: true },
  });

  window.webContents.on("console-message", (...args) => {
    const details = typeof args[1] === "object" ? args[1] : { level: args[1], message: args[2] };
    if (details.level === "error" || details.level === 3) consoleErrors.push(String(details.message ?? "Unknown console error"));
    if (details.level === "warning" || details.level === 2) consoleWarnings.push(String(details.message ?? "Unknown console warning"));
  });

  try {
    await Promise.race([
      window.loadURL(previewUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out loading ${previewUrl}`)), 15_000)),
    ]);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(
        `document.querySelectorAll('[data-strategy-id="machine-learning-price-targets"]').length > 0 && document.querySelector('.chart-hud-panel') !== null`,
      );
      if (ready) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }

    const implementation = await window.webContents.capturePage();
    await writeFile(implementationPath, implementation.toPNG());
    const [referenceBytes, implementationBytes] = await Promise.all([
      readFile(referencePath),
      readFile(implementationPath),
    ]);
    const comparisonMarkup = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#05080d;color:#d5d9e2;font:14px system-ui}
main{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;height:100%;padding:8px}
figure{display:grid;grid-template-rows:24px minmax(0,1fr);gap:4px;min-width:0;min-height:0;margin:0}
figcaption{color:#9aa6b8;font-weight:700}img{width:100%;height:100%;object-fit:contain;border:1px solid #253044;background:#111621}
</style></head><body><main>
<figure><figcaption>Reference</figcaption><img src="data:image/png;base64,${referenceBytes.toString("base64")}" /></figure>
<figure><figcaption>Implementation</figcaption><img src="data:image/png;base64,${implementationBytes.toString("base64")}" /></figure>
</main></body></html>`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(comparisonMarkup)}`);
    const comparison = await window.webContents.capturePage();
    await writeFile(comparisonPath, comparison.toPNG());

    console.log(JSON.stringify({ implementationPath, comparisonPath, consoleErrors, consoleWarnings }));
    app.exit(consoleErrors.length === 0 ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    app.exit(1);
  } finally {
    window.destroy();
  }
});
