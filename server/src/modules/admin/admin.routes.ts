import { Router } from "express";
import {
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";
import {
  getRegistrationById,
  listPendingRegistrations,
} from "../registrations/registration.service.js";
import {
  approveRegistration,
  bulkApproveRegistrations,
  bulkApproveSchema,
  bulkRejectRegistrations,
  bulkRejectSchema,
  rejectRegistration,
  rejectRegistrationSchema,
} from "./approval.service.js";
import { z } from "zod";
import { listSubscriptionHistoryById } from "../subscriptions/subscription-history.js";
import {
  adminExtendSubscription,
  adminSetSubscriptionStatus,
  approvePayment,
  listAdminPayments,
  listAdminSubscriptions,
  paymentsToCsv,
  rejectPayment,
} from "../subscriptions/subscription.service.js";
import {
  listDatabaseBackups,
  runDatabaseBackup,
} from "../../jobs/database-backup.js";
import { runSubscriptionAlertJob } from "../../jobs/subscription-alerts.js";
import { purgeExpiredCancelledSubscriptions } from "../subscriptions/subscription.service.js";
import {
  announcementSchema,
  deleteTenant,
  getAdminTenant,
  listActivityLogs,
  listAdminBranches,
  listAdminTenants,
  listPlansAdmin,
  sendAnnouncement,
  setTenantStatus,
  updatePlanAdmin,
  updatePlanSchema,
} from "./admin-ops.service.js";
import { getAdminDashboardStats } from "./admin.service.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/dashboard/stats", async (_req, res, next) => {
  try {
    const stats = await getAdminDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/registrations/pending", async (_req, res, next) => {
  try {
    const registrations = await listPendingRegistrations();
    res.json({ success: true, data: registrations });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/registrations/bulk-approve",
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = bulkApproveSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const results = await bulkApproveRegistrations(
        parsed.data.ids,
        req.user!.sub,
      );
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/registrations/bulk-reject",
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = bulkRejectSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const results = await bulkRejectRegistrations(
        parsed.data.ids,
        req.user!.sub,
        parsed.data.reason,
      );
      res.json({ success: true, data: results });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/registrations/:id", async (req, res, next) => {
  try {
    const registration = await getRegistrationById(String(req.params.id));
    res.json({ success: true, data: registration });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/registrations/:id/approve",
  async (req: AuthedRequest, res, next) => {
    try {
      const result = await approveRegistration(
        String(req.params.id),
        req.user!.sub,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/registrations/:id/reject",
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = rejectRegistrationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const result = await rejectRegistration(
        String(req.params.id),
        req.user!.sub,
        parsed.data.reason,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/payments", async (req, res, next) => {
  try {
    const status = String(req.query.status || "ALL").toUpperCase();
    const data = await listAdminPayments({
      status,
      page: req.query.page ? String(req.query.page) : undefined,
      pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/payments/export.csv", async (req, res, next) => {
  try {
    const status = String(req.query.status || "ALL").toUpperCase();
    const data = await listAdminPayments({ status, all: true });
    const csv = paymentsToCsv(data.items);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="kitchenos-payments.csv"',
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/payments/:id/approve",
  async (req: AuthedRequest, res, next) => {
    try {
      const schema = z.object({
        overrideStartDate: z.string().optional().nullable(),
        adminNotes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const result = await approvePayment({
        paymentId: String(req.params.id),
        adminId: req.user!.sub,
        overrideStartDate: parsed.data.overrideStartDate,
        adminNotes: parsed.data.adminNotes,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/payments/:id/reject",
  async (req: AuthedRequest, res, next) => {
    try {
      const schema = z.object({ reason: z.string().optional() });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const result = await rejectPayment({
        paymentId: String(req.params.id),
        adminId: req.user!.sub,
        reason: parsed.data.reason,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/subscriptions", async (req, res, next) => {
  try {
    const filter = String(req.query.status || "ALL").toUpperCase();
    const data = await listAdminSubscriptions({
      filter,
      page: req.query.page ? String(req.query.page) : undefined,
      pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/subscriptions/:id/history", async (req, res, next) => {
  try {
    const data = await listSubscriptionHistoryById(String(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/subscriptions/:id/extend",
  async (req: AuthedRequest, res, next) => {
    try {
      const schema = z.object({
        months: z.coerce.number().int(),
      });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const result = await adminExtendSubscription({
        subscriptionId: String(req.params.id),
        adminId: req.user!.sub,
        months: parsed.data.months,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/subscriptions/:id/status",
  async (req: AuthedRequest, res, next) => {
    try {
      const schema = z.object({
        status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const result = await adminSetSubscriptionStatus({
        subscriptionId: String(req.params.id),
        adminId: req.user!.sub,
        status: parsed.data.status,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/tenants", async (req, res, next) => {
  try {
    const data = await listAdminTenants({
      status: String(req.query.status || "ALL"),
      plan: String(req.query.plan || "ALL"),
      q: req.query.q ? String(req.query.q) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      page: req.query.page ? String(req.query.page) : undefined,
      pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
      all: String(req.query.all || "") === "1",
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/branches", async (req, res, next) => {
  try {
    const data = await listAdminBranches({
      q: req.query.q ? String(req.query.q) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      includeDeleted: String(req.query.includeDeleted || ""),
      page: req.query.page ? String(req.query.page) : undefined,
      pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/tenants/:id", async (req, res, next) => {
  try {
    const data = await getAdminTenant(String(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/tenants/:id/status",
  async (req: AuthedRequest, res, next) => {
    try {
      const schema = z.object({
        status: z.enum(["ACTIVE", "SUSPENDED"]),
        reason: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const data = await setTenantStatus({
        tenantId: String(req.params.id),
        adminId: req.user!.sub,
        status: parsed.data.status,
        reason: parsed.data.reason,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.delete(
  "/tenants/:id",
  requireSuperAdmin,
  async (req: AuthedRequest, res, next) => {
    try {
      const data = await deleteTenant(String(req.params.id), req.user!.sub);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/plans", async (_req, res, next) => {
  try {
    const data = await listPlansAdmin();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch(
  "/plans/:id",
  requireSuperAdmin,
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = updatePlanSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const data = await updatePlanAdmin(
        String(req.params.id),
        req.user!.sub,
        parsed.data,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get("/activity-logs", async (req, res, next) => {
  try {
    const data = await listActivityLogs({
      page: req.query.page ? String(req.query.page) : undefined,
      pageSize: req.query.pageSize ? String(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  "/announcements",
  async (req: AuthedRequest, res, next) => {
    try {
      const parsed = announcementSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Validation failed", parsed.error.flatten());
      }
      const data = await sendAnnouncement({
        adminId: req.user!.sub,
        title: parsed.data.title,
        message: parsed.data.message,
        audience: parsed.data.audience,
        tenantIds: parsed.data.tenantIds,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/** Manual trigger for FR-8.1 subscription lifecycle emails (also runs on a schedule). */
adminRouter.post(
  "/jobs/subscription-alerts",
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const data = await runSubscriptionAlertJob();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/** Manual trigger for FR-6.1 30-day cancelled-data purge. */
adminRouter.post(
  "/jobs/subscription-retention",
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const data = await purgeExpiredCancelledSubscriptions();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/** §6.3 — list local SQL dumps. */
adminRouter.get(
  "/jobs/database-backups",
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const data = await listDatabaseBackups();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/** §6.3 — create a database backup now. */
adminRouter.post(
  "/jobs/database-backup",
  requireSuperAdmin,
  async (_req, res, next) => {
    try {
      const data = await runDatabaseBackup();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
