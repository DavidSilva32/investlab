import { ApplicationError } from "@/backend/errors/application-error";
import { stockManualValuationController } from "@/backend/controllers/stock-manual-valuation.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

type Context = { params: Promise<{ ticker: string; inputKey: string }> };

function failed(error: unknown, requestId: string, ticker: string) {
  logger.error("stock_manual_valuation_request_failed", {
    requestId,
    ticker,
    error,
  });
  const status = error instanceof ApplicationError ? error.statusCode : 500;
  const message =
    error instanceof ApplicationError
      ? error.message
      : "Não foi possível acessar os dados informados agora.";
  return Response.json(
    { message, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
}

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/analyses/stocks/[ticker]/manual-inputs/[inputKey]",
  async function PUT(request: Request, context: Context) {
    const requestId = getApiRequestId(request);
    const { ticker, inputKey } = await context.params;
    try {
      return await stockManualValuationController.save(
        ticker,
        inputKey,
        request,
        requestId,
      );
    } catch (error) {
      return failed(error, requestId, ticker);
    }
  },
);
