import {
  getCurrentLogContext,
  runWithLogContext,
} from "@/infrastructure/logging/request-context";

type LogContext = {
  error?: unknown;
  [key: string]: unknown;
};

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return { message: error.message, stack: error.stack };
}

function write(
  level: "info" | "warn" | "error",
  event: string,
  context: LogContext = {},
) {
  const { error, ...safeContext } = context;
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...getCurrentLogContext(),
    ...safeContext,
    ...(error ? { error: serializeError(error) } : {}),
  };
  console[level](JSON.stringify(payload));
}

export const logger = {
  withContext: <T>(context: LogContext, operation: () => T) =>
    runWithLogContext(context, operation),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) =>
    write("error", event, context),
};
