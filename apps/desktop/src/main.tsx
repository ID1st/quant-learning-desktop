import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { MlPriceTargetsVisualQaPage } from "./pages/MlPriceTargetsVisualQaPage";
import { SmcVisualQaPage } from "./pages/SmcVisualQaPage";
import { IndicatorPaneVisualQaPage } from "./pages/IndicatorPaneVisualQaPage";
import "./styles.css";

const RootComponent =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("indicator-pane-visual-qa")
    ? IndicatorPaneVisualQaPage
    : import.meta.env.DEV && new URLSearchParams(window.location.search).has("smc-visual-qa")
      ? SmcVisualQaPage
      : import.meta.env.DEV && new URLSearchParams(window.location.search).has("ml-price-targets-visual-qa")
        ? MlPriceTargetsVisualQaPage
        : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
