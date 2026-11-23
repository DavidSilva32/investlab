import { ApplicationError } from "@/backend/errors/application-error";
import { financialController } from "@/backend/controllers/financial.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const POST = withApiRequestLogging(
  "POST",
  "/api/financial-entry-relations",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ApplicationError(
          "Revise a relação entre os lançamentos.",
          400,
        );
      }
      return await financialController.createEntryRelation(body, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"]("financial_entry_relation_failed", {
        requestId,
        error,
      });
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível relacionar os lançamentos.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
