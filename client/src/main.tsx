import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ensureCsrfToken } from "./lib/api";
import { disableBrowserScrollRestoration } from "./lib/scroll-to-top";

disableBrowserScrollRestoration();
void ensureCsrfToken();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
