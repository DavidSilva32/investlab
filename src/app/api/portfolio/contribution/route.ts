import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioController } from "@/backend/controllers/portfolio.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/contribution",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioController.calculateContribution(
        request,
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"]("portfolio_contribution_failed", {
        requestId,
        error,
      });
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível calcular a distribuição do aporte.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
