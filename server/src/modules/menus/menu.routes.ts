import { Router } from "express";
import {
  requireAuth,
  requireTenant,
} from "../../middleware/auth.js";
import {
  requireBranchContext,
  requireEditableMenu,
  type BranchAuthedRequest,
} from "../../middleware/branch-context.js";
import { AppError } from "../../middleware/error.js";
import { optimizeRequestImage } from "../../middleware/optimize-upload.js";
import { requirePasswordChanged } from "../../middleware/require-password-changed.js";
import { menuUpload } from "../../middleware/upload.js";
import {
  categorySchema,
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  getMenuWorkspace,
  menuItemSchema,
  updateCategory,
  updateMenuItem,
} from "./menu.service.js";

export const menuRouter = Router();

menuRouter.use(requireAuth, requireTenant, requirePasswordChanged, requireBranchContext);

function handleUpload(
  req: BranchAuthedRequest,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  menuUpload.single("image")(req, res, (err) => {
    if (err) {
      if (err instanceof AppError) return next(err);
      if (err instanceof Error && "code" in err && err.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(400, "Image must be 2MB or less"));
      }
      return next(
        new AppError(400, err instanceof Error ? err.message : "Upload failed"),
      );
    }
    void optimizeRequestImage(req, "menu")
      .then(() => next())
      .catch((optimizeErr) =>
        next(
          optimizeErr instanceof AppError
            ? optimizeErr
            : new AppError(400, "Could not process image"),
        ),
      );
  });
}

menuRouter.get("/", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await getMenuWorkspace(req.branchId!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

menuRouter.post(
  "/categories",
  requireEditableMenu,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const parsed = categorySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const category = await createCategory(
        req.user!.sub,
        req.branchId!,
        parsed.data,
      );
      res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/categories/:id",
  requireEditableMenu,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const parsed = categorySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const category = await updateCategory(
        req.user!.sub,
        req.branchId!,
        String(req.params.id),
        parsed.data,
      );
      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.delete(
  "/categories/:id",
  requireEditableMenu,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const result = await deleteCategory(
        req.user!.sub,
        req.branchId!,
        String(req.params.id),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.post(
  "/items",
  requireEditableMenu,
  handleUpload,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const parsed = menuItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const item = await createMenuItem(
        req.user!.sub,
        req.branchId!,
        parsed.data,
        req.file?.filename ?? null,
      );
      res.status(201).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.patch(
  "/items/:id",
  requireEditableMenu,
  handleUpload,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const parsed = menuItemSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
      }
      const item = await updateMenuItem(
        req.user!.sub,
        req.branchId!,
        String(req.params.id),
        parsed.data,
        req.file?.filename ?? null,
      );
      res.json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  },
);

menuRouter.delete(
  "/items/:id",
  requireEditableMenu,
  async (req: BranchAuthedRequest, res, next) => {
    try {
      const result = await deleteMenuItem(
        req.user!.sub,
        req.branchId!,
        String(req.params.id),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
