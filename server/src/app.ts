import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs";
import path from "node:path";
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

export function createApp() {
  const app = express();

  // Correct client IPs / rate limits when behind Nginx or a load balancer
  if (env.isProduction) {
    app.set("trust proxy", 1);
  }

  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, "payments"), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, "menu"), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, "logos"), { recursive: true });
  fs.mkdirSync(path.join(env.uploadDir, "qr"), { recursive: true });

  // Allow Vercel (and other frontends) to embed /uploads images via <img>.
  // Default helmet CORP "same-origin" blocks cross-origin image display.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    }),
  );
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Public media only — payment proofs are served via authenticated API routes
  const publicStatic = {
    setHeaders(res: express.Response) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  };
  app.use(
    "/uploads/logos",
    express.static(path.join(env.uploadDir, "logos"), publicStatic),
  );
  app.use(
    "/uploads/menu",
    express.static(path.join(env.uploadDir, "menu"), publicStatic),
  );
  app.use(
    "/uploads/qr",
    express.static(path.join(env.uploadDir, "qr"), publicStatic),
  );
  app.use("/uploads/payments", (_req, res) => {
    res.status(401).json({
      success: false,
      message: "Payment proof requires authentication",
    });
  });

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
