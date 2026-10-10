import { randomUUID } from "node:crypto";
import { getCurrentRequestId } from "@/infrastructure/logging/request-context";
import { logger } from "@/infrastructure/logging/logger";

type ApiHandler<Arguments extends unknown[]> = (
  ...arguments_: Arguments
) => Promise<Response>;

export function getApiRequestId(request?: Request) {
  const requestId = request?.headers.get("x-request-id");
  if (requestId && /^[a-zA-Z0-9._-]{1,128}$/.test(requestId)) return requestId;
  return getCurrentRequestId() ?? randomUUID();
}

export function withApiRequestLogging<Arguments extends unknown[]>(
  method: string,
  route: string,
  handler: ApiHandler<Arguments>,
): ApiHandler<Arguments> {
  return async (...arguments_) => {
    const request =
      arguments_[0] instanceof Request ? arguments_[0] : undefined;
    const requestId = getApiRequestId(request);
    const startedAt = Date.now();

    return logger.withContext({ requestId }, async () => {
      logger.info("api_request_started", {
        method,
        route,
        module: route.split("/")[2] ?? "unknown",
      });

      try {
        const response = await handler(...arguments_);
        response.headers.set("x-request-id", requestId);
        logger.info("api_request_completed", {
          method,
          route,
          module: route.split("/")[2] ?? "unknown",
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      } catch (error) {
        logger.error("api_request_failed", {
          method,
          route,
          module: route.split("/")[2] ?? "unknown",
          errorType: error instanceof Error ? error.name : "UnknownError",
          durationMs: Date.now() - startedAt,
        });
        throw error;
      }
    });
  };
}
