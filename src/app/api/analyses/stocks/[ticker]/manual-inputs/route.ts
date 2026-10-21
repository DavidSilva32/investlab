import { ApplicationError } from "@/backend/errors/application-error";
import { stockManualValuationController } from "@/backend/controllers/stock-manual-valuation.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/analyses/stocks/[ticker]/manual-inputs",
  async function GET(
    request: Request,
    context: { params: Promise<{ ticker: string }> },
  ) {
    const requestId = getApiRequestId(request);
    const { ticker } = await context.params;
    try {
      return await stockManualValuationController.list(ticker, requestId);
    } catch (error) {
      logger.error("stock_manual_valuation_load_failed", {
        requestId,
        ticker,
        error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 500;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível carregar os dados informados agora.";
      return Response.json(
        { message, requestId },
        {
          status,
          headers: {
            "x-request-id": requestId,
            "cache-control": "private, no-store",
          },
        },
      );
    }
  },
);
