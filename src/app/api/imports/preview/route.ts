import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { importController } from "@/backend/controllers/import.controller";
import { logger } from "@/infrastructure/logging/logger";
export const runtime = "nodejs";
export const POST = withApiRequestLogging(
  "POST",
  "/api/imports/preview",
  async function POST(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await importController.preview(request, requestId);
    } catch (error) {
      const expected = error instanceof ApplicationError;
      logger[expected ? "warn" : "error"](
        expected ? "b3_import_preview_rejected" : "b3_import_preview_failed",
        { requestId, error },
      );
      return Response.json(
        {
          message: expected ? error.message : "Não foi possível ler o arquivo.",
        },
        {
          status: expected ? error.statusCode : 500,
          headers: { "x-request-id": requestId },
        },
      );
    }
  },
);
