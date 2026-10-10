import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { portfolioController } from "@/backend/controllers/portfolio.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioController.overview(requestId);
    } catch (error) {
      logger.error("portfolio_overview_failed", { requestId, error });
      return Response.json(
        { message: "Não foi possível consultar a carteira." },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  },
);
