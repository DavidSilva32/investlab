import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { financialRecurrencesController } from "@/backend/controllers/financial-recurrences.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/financial-recurrences/occurrences",
  async function PUT(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialRecurrencesController.realize(
        await request.json(),
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "financial_recurrence_occurrence_failed",
        { requestId, operation: "realize", error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível registrar o valor realizado.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
