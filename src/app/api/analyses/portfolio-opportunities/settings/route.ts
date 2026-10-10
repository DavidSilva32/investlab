import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { stockOpportunityAnalysisController } from "@/backend/controllers/stock-opportunity-analysis.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/analyses/portfolio-opportunities/settings",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await stockOpportunityAnalysisController.saveBazinTargetYield(
        request,
        requestId,
      );
    } catch (error) {
      logger.error("stock_opportunity_bazin_yield_update_failed", {
        requestId,
        error,
      });
      const status = error instanceof ApplicationError ? error.statusCode : 500;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível atualizar a taxa configurada.";
      return Response.json(
        { message, requestId },
        { status, headers: { "x-request-id": requestId } },
      );
    }
  },
);
