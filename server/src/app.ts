import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { csrfProtect } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { publicRouter } from "./modules/registrations/registration.routes.js";
import { branchRouter } from "./modules/branches/branch.routes.js";
import { menuRouter } from "./modules/menus/menu.routes.js";
import { qrRouter } from "./modules/qr/qr.routes.js";
import {
  subscriptionRouter,
  tenantPaymentsRouter,
} from "./modules/subscriptions/subscription.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { tenantSettingsRouter } from "./modules/tenant/settings.routes.js";
import { tenantRouter } from "./modules/tenant/tenant.routes.js";

function mountSpa(app: express.Express) {
  const dist = env.clientDistPath;
  const indexHtml = path.join(dist, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `SERVE_CLIENT is enabled but SPA build not found at ${indexHtml}. Run npm run build -w client (or set CLIENT_DIST_PATH).`,
    );
  }

  app.use(
    express.static(dist, {
      index: false,
      maxAge: env.isProduction ? "1d" : 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  app.get(/^(?!\/api(?:\/|$)|\/health(?:\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
}

export function createApp() {
  const app = express();

  // Correct client IPs / rate limits behind Apache/Nginx / cPanel proxy
  if (env.isProduction) {
    app.set("trust proxy", 1);
  }

  // Allow frontends to embed Cloudinary (and legacy) images via <img>.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
      // SPA + API on one origin: allow default helmet CSP to stay off for Vite assets.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    }),
  );
  // Scrub secrets from access logs (activation/reset tokens in query strings).
  morgan.token("url-safe", (req) => {
    const raw =
      ("originalUrl" in req && typeof (req as { originalUrl?: string }).originalUrl === "string"
        ? (req as { originalUrl: string }).originalUrl
        : null) ||
      req.url ||
      "";
    return raw.replace(
      /([?&](?:token|activationToken|resetToken|otp|code)=)[^&]*/gi,
      "$1[redacted]",
    );
  });
  app.use(
    morgan(
      env.nodeEnv === "development"
        ? "dev"
        : ':remote-addr - :remote-user [:date[clf]] ":method :url-safe HTTP/:http-version" :status :res[content-length]',
    ),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Media is served from Cloudinary. Legacy /uploads/* local static hosting removed.

  // API-only root probe when SPA is not served from Express.
  if (!env.serveClient) {
    app.get("/", (_req, res) => {
      res.status(200).json({
        success: true,
        service: "KitchenOS API",
        status: "ok",
        health: "/health",
      });
    });
    app.head("/", (_req, res) => {
      res.status(200).end();
    });
  }

  app.use("/api/v1/health", healthRouter);
  // Convenience alias for probes that hit /health instead of /api/v1/health
  app.use("/health", healthRouter);
  app.use("/api/v1", csrfProtect);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", publicRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/tenant", tenantRouter);
  app.use("/api/v1/tenant/branches", branchRouter);
  app.use("/api/v1/tenant/menu", menuRouter);
  app.use("/api/v1/tenant/qr", qrRouter);
  app.use("/api/v1/tenant/subscription", subscriptionRouter);
  app.use("/api/v1/tenant/payments", tenantPaymentsRouter);
  app.use("/api/v1/tenant/settings", tenantSettingsRouter);
  app.use("/api/v1/tenant/analytics", analyticsRouter);

  if (env.serveClient) {
    mountSpa(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
