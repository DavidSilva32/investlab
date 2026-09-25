import { randomUUID } from "node:crypto";
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

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
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
}

export async function PATCH(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
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
}
