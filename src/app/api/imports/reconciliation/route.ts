import { ApplicationError } from "@/backend/errors/application-error";
import { importController } from "@/backend/controllers/import.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/imports/reconciliation",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await importController.saveReconciliationDecisions(
        request,
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        expected
          ? "b3_reconciliation_decision_rejected"
          : "b3_reconciliation_decision_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível atualizar a reconciliação.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
