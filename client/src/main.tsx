import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ensureCsrfToken } from "./lib/api";
import { disableBrowserScrollRestoration } from "./lib/scroll-to-top";

disableBrowserScrollRestoration();
void ensureCsrfToken();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
