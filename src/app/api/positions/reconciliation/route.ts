import { ApplicationError } from "@/backend/errors/application-error";
import { positionReconciliationController } from "@/backend/controllers/position-reconciliation.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";
export const runtime = "nodejs";

async function respond(request: Request, reverse: boolean) {
  const requestId = getApiRequestId(request);
  try {
    return reverse
      ? await positionReconciliationController.reverse(request, requestId)
      : await positionReconciliationController.list(requestId);
  } catch (error) {
    const expected = error instanceof ApplicationError;
    logger[expected ? "warn" : "error"]("position_reconciliation_failed", {
      requestId,
      error,
    });
    return Response.json(
      {
        message: expected
          ? error.message
          : "Não foi possível consultar ou atualizar a conciliação.",
      },
      { status: expected ? error.statusCode : 500 },
    );
  }
}
export const GET = withApiRequestLogging(
  "GET",
  "/api/positions/reconciliation",
  (request: Request) => respond(request, false),
);
export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/positions/reconciliation",
  (request: Request) => respond(request, true),
);
