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
    // Only expose validation/business details for client errors
    if (err.statusCode < 500 && err.details !== undefined) {
      payload.details = err.details;
    }
    return res.status(err.statusCode).json(payload);
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
