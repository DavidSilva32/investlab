import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { recurringExpensesController } from "@/backend/controllers/recurring-expenses.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string, operation: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("recurring_expenses_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível carregar as despesas recorrentes."
          : "Não foi possível salvar a despesa recorrente.",
    },
    { status: expected ? error.statusCode : 500 },
  );
}

export const GET = withApiRequestLogging(
  "GET",
  "/api/recurring-expenses",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const month = new URL(request.url).searchParams.get("month");
      return await recurringExpensesController.get(month, requestId);
    } catch (error) {
      return failure(error, requestId, "read");
    }
  },
);

export const POST = withApiRequestLogging(
  "POST",
  "/api/recurring-expenses",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await recurringExpensesController.create(
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
  "/api/recurring-expenses",
  async function PATCH(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await recurringExpensesController.update(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId, "update");
    }
  },
);
