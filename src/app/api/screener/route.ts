import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { screenerController } from "@/backend/controllers/screener.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await screenerController.search(
      new URL(request.url).searchParams,
      requestId,
    );
  } catch (error) {
    logger.error("screener_query_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível consultar as empresas agora.";
    return Response.json(
      { message, requestId },
      {
        status,
        headers: { "x-request-id": requestId },
      },
    );
  }
}
