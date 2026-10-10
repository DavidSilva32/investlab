import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioController } from "@/backend/controllers/portfolio.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio/monthly-review",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioController.monthlyReview(request, requestId);
    } catch (error) {
      logger.error("portfolio_monthly_review_failed", { requestId, error });
      const status = error instanceof ApplicationError ? error.statusCode : 500;
      const message =
        error instanceof ApplicationError
          ? error.message
          : "Não foi possível consultar os fechamentos da carteira.";
      return Response.json(
        { message },
        { status, headers: { "x-request-id": requestId } },
      );
    }
  },
);
