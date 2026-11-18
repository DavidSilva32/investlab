import { ApplicationError } from "@/backend/errors/application-error";
import { financialStatementImportController } from "@/backend/controllers/financial-statement-import.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/financial-statement-import/confirm",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError(
          "Revise os lançamentos antes de confirmar.",
          400,
        );
      }
      return await financialStatementImportController.confirm(body, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        "financial_statement_confirm_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível concluir a importação.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
