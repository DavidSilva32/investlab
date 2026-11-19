import { ApplicationError } from "@/backend/errors/application-error";
import { financialController } from "@/backend/controllers/financial.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string, operation: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("financial_category_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível carregar as categorias.",
    },
    { status: expected ? error.statusCode : 500 },
  );
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/financial-categories",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialController.getCategories(requestId);
    } catch (error) {
      return failure(error, requestId, "read");
    }
  },
);
