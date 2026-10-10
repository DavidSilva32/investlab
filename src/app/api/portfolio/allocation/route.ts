import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioAllocationController } from "@/backend/controllers/portfolio-allocation.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function errorResponse(
  error: unknown,
  requestId: string,
  event: string,
  fallback: string,
) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"](event, { requestId, error });
  return Response.json(
    { message: expected ? error.message : fallback },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio/allocation",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioAllocationController.get(requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "portfolio_allocation_load_failed",
        "Não foi possível carregar a alocação.",
      );
    }
  },
);

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/portfolio/allocation",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioAllocationController.update(request, requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "portfolio_classification_update_failed",
        "Não foi possível salvar a classificação.",
      );
    }
  },
);

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/portfolio/allocation",
  async function PUT(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioAllocationController.updateTargets(
        request,
        requestId,
      );
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "portfolio_allocation_targets_update_failed",
        "Não foi possível salvar as metas de alocação.",
      );
    }
  },
);
