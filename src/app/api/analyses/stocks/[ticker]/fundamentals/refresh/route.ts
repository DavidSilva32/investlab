import { after } from "next/server";
import { stockAnalysisController } from "@/backend/controllers/stock-analysis.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = withApiRequestLogging(
  "POST",
  "/api/analyses/stocks/[ticker]/fundamentals/refresh",
  async function POST(
    request: Request,
    context: { params: Promise<{ ticker: string }> },
  ) {
    const requestId = getApiRequestId(request);
    const { ticker } = await context.params;
    try {
      const { state, run } =
        await stockAnalysisController.requestFundamentalsRefresh(
          ticker,
          requestId,
        );
      if (run) after(run);
      return Response.json(
        { state, requestId },
        {
          status: run ? 202 : 200,
          headers: {
            "x-request-id": requestId,
            "cache-control": "private, no-store",
          },
        },
      );
    } catch (error) {
      logger.error("stock_fundamentals_refresh_request_failed", {
        requestId,
        ticker,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 503;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível iniciar a atualização dos fundamentos.";
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
