import { Router } from "express";
import {
  requireAuth,
  requireTenant,
} from "../../middleware/auth.js";
import {
  requireBranchContext,
  type BranchAuthedRequest,
} from "../../middleware/branch-context.js";
import { AppError } from "../../middleware/error.js";
import {
  buildPrintHtml,
  getBranchQr,
  getQrFilePath,
  regenerateBranchQr,
  updateBranchQrStyle,
  updateQrStyleSchema,
} from "./qr.service.js";

export const qrRouter = Router();

qrRouter.use(requireAuth, requireTenant, requireBranchContext);

qrRouter.get("/", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await getBranchQr(req.user!.sub, req.branchId!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

qrRouter.post("/regenerate", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await regenerateBranchQr(req.user!.sub, req.branchId!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

qrRouter.patch("/style", async (req: BranchAuthedRequest, res, next) => {
  try {
    const parsed = updateQrStyleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError(400, "Please check the form and try again", parsed.error.flatten());
    }
    if (
      parsed.data.fgColor === undefined &&
      parsed.data.bgColor === undefined &&
      parsed.data.useLogo === undefined
    ) {
      throw new AppError(400, "Provide at least one style field to update");
    }
    const data = await updateBranchQrStyle(
      req.user!.sub,
      req.branchId!,
      parsed.data,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

qrRouter.get("/download", async (req: BranchAuthedRequest, res, next) => {
  try {
    const format = String(req.query.format || "png").toLowerCase();
    if (format !== "png" && format !== "svg") {
      throw new AppError(400, "Format must be png or svg");
    }

    const file = await getQrFilePath(req.user!.sub, req.branchId!, format);
    res.setHeader("Content-Type", file.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.fileName}"`,
    );
    res.sendFile(file.filePath);
  } catch (error) {
    next(error);
  }
});

qrRouter.get("/print", async (req: BranchAuthedRequest, res, next) => {
  try {
    const data = await getBranchQr(req.user!.sub, req.branchId!);
    const assetBaseUrl = `${req.protocol}://${req.get("host")}`;
    const html = buildPrintHtml({
      businessName: data.businessName,
      branchName: data.branchName,
      location: data.location,
      menuUrl: data.menuUrl,
      qrCodeUrl: data.qrCodeUrl,
      assetBaseUrl,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    next(error);
  }
});
