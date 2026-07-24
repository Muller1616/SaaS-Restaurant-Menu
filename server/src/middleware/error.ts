import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError | null {
  switch (err.code) {
    case "P1001":
    case "P1002":
    case "P1017":
    case "P2024":
    case "P2028":
      return new AppError(503, "Service temporarily unavailable. Please try again.", {
        code: err.code,
      });
    case "P2010":
      return new AppError(500, "Something went wrong. Please try again.", {
        code: err.code,
      });
    case "P2002":
      return new AppError(409, "A record with that unique value already exists", {
        code: err.code,
      });
    case "P2025":
      return new AppError(404, "Record not found", { code: err.code });
    default:
      return null;
  }
}

/** Only expose structured client details for known AppError payloads. */
function safeClientDetails(details: unknown): unknown {
  if (details == null || typeof details !== "object") return undefined;
  if (Array.isArray(details)) return undefined;
  const obj = details as Record<string, unknown>;
  // Zod flatten / business codes are safe; strip Prisma meta and raw errors.
  if ("meta" in obj) {
    const { meta: _meta, ...rest } = obj;
    return Object.keys(rest).length ? rest : undefined;
  }
  return details;
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    const payload: {
      success: false;
      message: string;
      details?: unknown;
    } = {
      success: false,
      message: err.message,
    };
    const exposeDetails =
      err.details !== undefined &&
      (err.statusCode < 500 || err.statusCode === 502);
    if (exposeDetails) {
      const details = safeClientDetails(err.details);
      if (details !== undefined) payload.details = details;
    }
    return res.status(err.statusCode).json(payload);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = mapPrismaError(err);
    if (mapped) {
      logger.warn("Mapped Prisma error", {
        code: err.code,
        message: err.message,
        statusCode: mapped.statusCode,
      });
      return res.status(mapped.statusCode).json({
        success: false,
        message: mapped.message,
        ...(env.nodeEnv === "development"
          ? { details: { code: err.code } }
          : {}),
      });
    }
  }

  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    logger.error("Prisma initialization/runtime failure", err);
    return res.status(503).json({
      success: false,
      message: "Service temporarily unavailable. Please try again.",
      ...(env.nodeEnv === "development"
        ? { details: { name: err.name } }
        : {}),
    });
  }

  if (
    err instanceof Error &&
    /Timed out fetching a new connection from the connection pool/i.test(
      err.message,
    )
  ) {
    logger.warn("Prisma connection pool timeout", { message: err.message });
    return res.status(503).json({
      success: false,
      message: "Service temporarily unavailable. Please try again.",
      ...(env.nodeEnv === "development"
        ? { details: { name: err.name } }
        : {}),
    });
  }

  logger.error("Unhandled request error", err);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(env.nodeEnv === "development" && err instanceof Error
      ? { details: { name: err.name, message: err.message } }
      : {}),
  });
}
