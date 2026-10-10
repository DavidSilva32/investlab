import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { stockOpportunityAnalysisController } from "@/backend/controllers/stock-opportunity-analysis.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/analyses/portfolio-opportunities/[ticker]/[inputKey]",
  async function DELETE(
    request: Request,
    { params }: { params: Promise<{ ticker: string; inputKey: string }> },
  ) {
    const requestId = getApiRequestId(request);
    try {
      const { ticker, inputKey } = await params;
      return await stockOpportunityAnalysisController.deleteInput(
        ticker,
        inputKey,
        requestId,
      );
    } catch (error) {
      logger.error("stock_opportunity_manual_input_delete_failed", {
        requestId,
        error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 500;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível remover a entrada manual.";
      return Response.json(
        { message, requestId },
        { status, headers: { "x-request-id": requestId } },
      );
    }
  },
);
