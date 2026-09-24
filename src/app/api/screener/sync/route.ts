import { randomUUID, timingSafeEqual } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { screenerSyncController } from "@/backend/controllers/screener-sync.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasValidSyncSecret(
  received: string | null,
  expected: string | undefined,
) {
  if (!expected || !received) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function bearerSecret(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const expected = process.env.SCREENER_SYNC_SECRET;
  if (!expected) {
    return Response.json(
      {
        message:
          "A sincronização do screener não está habilitada neste ambiente.",
      },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }
  if (
    !hasValidSyncSecret(
      bearerSecret(request.headers.get("authorization")),
      expected,
    )
  ) {
    return Response.json(
      { message: "Não autorizado." },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }
  try {
    const result = await screenerSyncController.sync();
    return Response.json(
      { ...result, requestId },
      {
        headers: { "x-request-id": requestId },
      },
    );
  } catch (error) {
    logger.error("screener_sync_route_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "A sincronização do screener não foi concluída.";
    return Response.json(
      { message, requestId },
      {
        status,
        headers: { "x-request-id": requestId },
      },
    );
  }
}

export const screenerSyncRouteInternals = { hasValidSyncSecret };
