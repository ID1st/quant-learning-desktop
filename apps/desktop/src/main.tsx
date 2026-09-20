import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { MlPriceTargetsVisualQaPage } from "./pages/MlPriceTargetsVisualQaPage";
import { SmcVisualQaPage } from "./pages/SmcVisualQaPage";
import { IndicatorPaneVisualQaPage } from "./pages/IndicatorPaneVisualQaPage";
import { AuthVisualQaPage } from "./pages/AuthVisualQaPage";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

window.dispatchEvent(new Event("quant-renderer-entry"));

const RootComponent =
  (import.meta.env.DEV || import.meta.env.VITE_AUTH_VISUAL_QA === "true") &&
  new URLSearchParams(window.location.search).has("auth-visual-qa")
    ? AuthVisualQaPage
    : import.meta.env.DEV &&
        new URLSearchParams(window.location.search).has("indicator-pane-visual-qa")
      ? IndicatorPaneVisualQaPage
      : import.meta.env.DEV && new URLSearchParams(window.location.search).has("smc-visual-qa")
        ? SmcVisualQaPage
        : import.meta.env.DEV &&
            new URLSearchParams(window.location.search).has("ml-price-targets-visual-qa")
          ? MlPriceTargetsVisualQaPage
          : App;

function RendererMountReporter() {
  React.useEffect(() => {
    window.dispatchEvent(new Event("quant-renderer-mounted"));
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <RootComponent />
      <RendererMountReporter />
    </I18nProvider>
  </React.StrictMode>,
);
