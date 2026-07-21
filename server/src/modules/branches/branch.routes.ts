import { Router } from "express";
import {
  requireAuth,
  requireTenant,
  type AuthedRequest,
} from "../../middleware/auth.js";
import { AppError } from "../../middleware/error.js";
import {
  branchInputSchema,
  createBranch,
  listBranches,
  softDeleteBranch,
  updateBranch,
} from "./branch.service.js";

export const branchRouter = Router();

branchRouter.use(requireAuth, requireTenant);

branchRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const data = await listBranches(req.user!.sub);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

branchRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = branchInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const branch = await createBranch(req.user!.sub, parsed.data);
    res.status(201).json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
});

branchRouter.patch("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = branchInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    const branch = await updateBranch(
      req.user!.sub,
      String(req.params.id),
      parsed.data,
    );
    res.json({ success: true, data: branch });
  } catch (error) {
    next(error);
  }
});

branchRouter.delete("/:id", async (req: AuthedRequest, res, next) => {
  try {
    const result = await softDeleteBranch(req.user!.sub, String(req.params.id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
