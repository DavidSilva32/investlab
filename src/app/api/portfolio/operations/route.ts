import { ApplicationError } from "@/backend/errors/application-error";
import { portfolioOperationController } from "@/backend/controllers/portfolio-operation.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

const respondToError = (
  error: unknown,
  requestId: string,
  event: string,
  fallback: string,
) => {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"](event, { requestId, error });
  return Response.json(
    {
      message: expected ? error.message : fallback,
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
};

export const GET = withApiRequestLogging(
  "GET",
  "/api/portfolio/operations",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioOperationController.list(requestId);
    } catch (error) {
      return respondToError(
        error,
        requestId,
        "portfolio_operations_load_failed",
        "Não foi possível carregar as operações manuais.",
      );
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/portfolio/operations",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await portfolioOperationController.create(request, requestId);
    } catch (error) {
      return respondToError(
        error,
        requestId,
        "portfolio_operation_create_failed",
        "Não foi possível salvar a operação manual.",
      );
    }
  },
);
