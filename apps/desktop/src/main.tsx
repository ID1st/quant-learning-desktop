import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { SmcVisualQaPage } from "./pages/SmcVisualQaPage";
import "./styles.css";

const RootComponent =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("smc-visual-qa")
    ? SmcVisualQaPage
    : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
