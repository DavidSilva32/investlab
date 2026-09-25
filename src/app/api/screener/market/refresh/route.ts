import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { screenerMarketController } from "@/backend/controllers/screener-market.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  if (!isSameOrigin(request)) {
    return Response.json(
      { message: "Origem da solicitação não autorizada.", requestId },
      { status: 403, headers: { "x-request-id": requestId } },
    );
  }
  try {
    const result = await screenerMarketController.refresh(requestId);
    return Response.json(
      { ...result, requestId },
      {
        headers: { "x-request-id": requestId, "cache-control": "no-store" },
      },
    );
  } catch (error) {
    logger.error("screener_market_refresh_route_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível atualizar os dados de mercado agora.";
    return Response.json(
      { message, requestId },
      { status, headers: { "x-request-id": requestId } },
    );
  }
}

export const screenerMarketRefreshRouteInternals = { isSameOrigin };
