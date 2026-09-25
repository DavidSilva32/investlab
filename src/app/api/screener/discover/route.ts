import { randomUUID } from "node:crypto";
import { screenerController } from "@/backend/controllers/screener.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await screenerController.discover(requestId);
  } catch (error) {
    logger.error("screener_discovery_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        message: "Não foi possível carregar empresas para estudo agora.",
        requestId,
      },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}
