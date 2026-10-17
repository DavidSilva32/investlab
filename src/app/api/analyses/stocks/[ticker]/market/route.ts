import { stockAnalysisController } from "@/backend/controllers/stock-analysis.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/analyses/stocks/[ticker]/market",
  async function GET(
    request: Request,
    context: { params: Promise<{ ticker: string }> },
  ) {
    const requestId = getApiRequestId(request);
    const { ticker } = await context.params;
    try {
      return await stockAnalysisController.getMarket(ticker, requestId);
    } catch (error) {
      logger.error("stock_analysis_market_failed", {
        requestId,
        ticker,
        error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 502;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível consultar a cotação agora.";
      return Response.json(
        { message },
        { status, headers: { "x-request-id": requestId } },
      );
    }
  },
);
