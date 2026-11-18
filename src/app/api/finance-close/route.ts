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
  "/api/finance-close",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialController.closeMonth(
        await request.json(),
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"]("financial_month_close_failed", {
        requestId,
        operation: "close",
        error,
      });
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível fechar o mês financeiro.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
