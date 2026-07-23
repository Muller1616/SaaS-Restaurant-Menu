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
  // https://www.prisma.io/docs/orm/reference/error-reference
  switch (err.code) {
    case "P1001": // Can't reach database
    case "P1002": // Database timeout
    case "P1017": // Server closed connection
      return new AppError(
        503,
        "Database is temporarily unreachable. Check DATABASE_URL and that Postgres is running.",
        { code: err.code },
      );
    case "P2024": // Timed out fetching connection from pool
      return new AppError(
        503,
        "Database connection pool exhausted. Retry shortly or reduce concurrent queries.",
        { code: err.code },
      );
    case "P2028": // Transaction API error (timeout / closed)
      return new AppError(
        503,
        "Database transaction timed out. Retry the operation; if this persists locally, use the local Postgres DATABASE_URL.",
        { code: err.code },
      );
    case "P2010": // Raw query failed
      return new AppError(
        500,
        "A database query failed. Check server logs for details.",
        { code: err.code, meta: err.meta },
      );
    case "P2002":
      return new AppError(409, "A record with that unique value already exists", {
        code: err.code,
        meta: err.meta,
      });
    case "P2025":
      return new AppError(404, "Record not found", { code: err.code });
    default:
      return null;
  }
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
    // Expose safe business details for client errors and known delivery failures
    const exposeDetails =
      err.details !== undefined &&
      (err.statusCode < 500 || err.statusCode === 502);
    if (exposeDetails) {
      payload.details = err.details;
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
          ? { details: { code: err.code, message: err.message } }
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
      message:
        "Database connection failed. Verify DATABASE_URL and that Postgres is running.",
      ...(env.nodeEnv === "development"
        ? { details: { name: err.name, message: err.message } }
        : {}),
    });
  }

  // Connection-pool timeout sometimes surfaces as a plain Error message
  if (
    err instanceof Error &&
    /Timed out fetching a new connection from the connection pool/i.test(
      err.message,
    )
  ) {
    logger.warn("Prisma connection pool timeout", { message: err.message });
    return res.status(503).json({
      success: false,
      message:
        "Database connection pool exhausted. Retry shortly or check DATABASE_URL latency.",
      ...(env.nodeEnv === "development"
        ? { details: { name: err.name, message: err.message } }
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
