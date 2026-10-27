import { ApplicationError } from "@/backend/errors/application-error";
import { financialController } from "@/backend/controllers/financial.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/finance-overview",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const month = new URL(request.url).searchParams.get("month");
      return await financialController.getOverview(month, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"]("financial_overview_failed", {
        requestId,
        operation: "read",
        error,
      });
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível carregar o resumo financeiro.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
