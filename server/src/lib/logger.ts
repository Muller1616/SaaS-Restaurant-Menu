type LogMeta = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(process.env.NODE_ENV === "development" && error.stack
        ? { stack: error.stack }
        : {}),
    };
  }
  return { message: String(error) };
}

function write(
  level: "info" | "warn" | "error",
  message: string,
  meta?: LogMeta,
) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** Structured production logger — prefer this over raw console.* in app code. */
export const logger = {
  info(message: string, meta?: LogMeta) {
    write("info", message, meta);
  },
  warn(message: string, meta?: LogMeta) {
    write("warn", message, meta);
  },
  error(message: string, error?: unknown, meta?: LogMeta) {
    write("error", message, {
      ...meta,
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    });
  },
};
