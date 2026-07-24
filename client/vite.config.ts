import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function assertProductionApiUrl(apiUrl: string) {
  const url = apiUrl.trim();
  if (!url) {
    throw new Error(
      "VITE_API_URL is required for production builds. Set it to your public API origin (e.g. https://api.example.com).",
    );
  }
  if (/localhost|127\.0\.0\.1/i.test(url)) {
    throw new Error(
      `VITE_API_URL must not point at localhost in production builds (got "${url}").`,
    );
  }
  if (/YOUR-API|example\.com|changeme/i.test(url)) {
    throw new Error(
      `VITE_API_URL looks like a placeholder ("${url}"). Set the real production API origin before building.`,
    );
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error(
        `VITE_API_URL must use https in production (got "${url}").`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("https")) throw error;
    throw new Error(`VITE_API_URL is not a valid URL: "${url}"`);
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  if (command === "build" && mode === "production") {
    assertProductionApiUrl(env.VITE_API_URL ?? process.env.VITE_API_URL ?? "");
  }

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("recharts") || id.includes("d3-")) {
              return "charts";
            }
            if (id.includes("@tanstack")) return "query";
            if (id.includes("react-router")) return "router";
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "react-vendor";
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
        "/uploads": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
