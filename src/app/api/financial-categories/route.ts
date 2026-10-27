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
        : operation === "read"
          ? "Não foi possível carregar as categorias."
          : "Não foi possível salvar a categoria.",
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

export const POST = withApiRequestLogging(
  "POST",
  "/api/financial-categories",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialController.createCategory(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "create");
    }
  },
);

export const PATCH = withApiRequestLogging(
  "PATCH",
  "/api/financial-categories",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialController.updateCategory(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "update");
    }
  },
);

export const DELETE = withApiRequestLogging(
  "DELETE",
  "/api/financial-categories",
  async function DELETE(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const id = new URL(request.url).searchParams.get("id");
      return await financialController.deleteCategory(id, requestId);
    } catch (error) {
      return failure(error, requestId, "delete");
    }
  },
);
