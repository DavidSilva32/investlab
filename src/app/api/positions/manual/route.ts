import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { manualPortfolioPositionController } from "@/backend/controllers/manual-portfolio-position.controller";
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
  "/api/positions/manual",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await manualPortfolioPositionController.list(requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "manual_positions_load_failed",
        "Não foi possível carregar as posições manuais.",
      );
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/positions/manual",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await manualPortfolioPositionController.create(request, requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "manual_position_create_failed",
        "Não foi possível salvar a posição manual.",
      );
    }
  },
);

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/positions/manual",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await manualPortfolioPositionController.update(request, requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "manual_position_update_failed",
        "Não foi possível atualizar a posição manual.",
      );
    }
  },
);

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/positions/manual",
  async function DELETE(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await manualPortfolioPositionController.delete(request, requestId);
    } catch (error) {
      return errorResponse(
        error,
        requestId,
        "manual_position_delete_failed",
        "Não foi possível remover a posição manual.",
      );
    }
  },
);
