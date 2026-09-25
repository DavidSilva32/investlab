import { randomUUID } from "node:crypto";
import { screenerMarketController } from "@/backend/controllers/screener-market.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const result = await screenerMarketController.status();
    return Response.json(
      { ...result, requestId },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    logger.error("screener_market_status_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        message: "Não foi possível consultar o estado dos dados de mercado.",
        requestId,
      },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
