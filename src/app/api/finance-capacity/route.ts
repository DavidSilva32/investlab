import { ApplicationError } from "@/backend/errors/application-error";
import { financialController } from "@/backend/controllers/financial.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/finance-capacity",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialController.simulateMonthlyCapacity(
        await request.json(),
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "financial_capacity_simulation_failed",
        {
          requestId,
          operation: "simulation",
          error,
        },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível simular a capacidade mensal.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
