import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { financialRecurrencesController } from "@/backend/controllers/financial-recurrences.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string, operation: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("financial_recurrence_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível carregar as recorrências financeiras."
          : "Não foi possível salvar a recorrência financeira.",
    },
    { status: expected ? error.statusCode : 500 },
  );
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/financial-recurrences",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const month = new URL(request.url).searchParams.get("month");
      return await financialRecurrencesController.get(month, requestId);
    } catch (error) {
      return failure(error, requestId, "read");
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/financial-recurrences",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialRecurrencesController.create(
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
  "/api/financial-recurrences",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await financialRecurrencesController.update(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "update");
    }
  },
);
