import { ApplicationError } from "@/backend/errors/application-error";
import { importController } from "@/backend/controllers/import.controller";
import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/proventos",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await importController.listProventos(requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        expected ? "b3_proventos_query_rejected" : "b3_proventos_query_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected
            ? error.message
            : "Não foi possível consultar os proventos.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
