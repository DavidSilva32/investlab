import { AsyncLocalStorage } from "node:async_hooks";

type RequestLogContext = Record<string, unknown>;

const requestLogContext = new AsyncLocalStorage<RequestLogContext>();

export function runWithLogContext<T>(
  context: RequestLogContext,
  operation: () => T,
) {
  return requestLogContext.run(context, operation);
}

export function getCurrentLogContext() {
  return requestLogContext.getStore();
}

export function getCurrentRequestId() {
  const requestId = getCurrentLogContext()?.requestId;
  return typeof requestId === "string" ? requestId : undefined;
}
