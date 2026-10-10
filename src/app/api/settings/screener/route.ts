import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { screenerSyncController } from "@/backend/controllers/screener-sync.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export const GET = withApiRequestLogging(
  "GET",
  "/api/settings/screener",
  async function GET(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      const result = await screenerSyncController.status();
      return Response.json(
        { ...result, requestId },
        {
          headers: { "x-request-id": requestId, "cache-control": "no-store" },
        },
      );
    } catch (error) {
      logger.error("screener_sync_status_failed", {
        requestId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return Response.json(
        {
          message: "Não foi possível consultar o status da sincronização.",
          requestId,
        },
        { status: 500, headers: { "x-request-id": requestId } },
      );
    }
  },
);
