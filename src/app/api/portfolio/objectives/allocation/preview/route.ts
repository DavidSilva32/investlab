import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/objectives/allocation/preview",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioObjectivesController.previewAllocation(
        await request.json(),
        requestId,
      );
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "portfolio_objective_allocation_preview_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível buscar uma distribuição agora.",
        },
        { status: expected ? error.statusCode : 500 },
      );
    }
  },
);
