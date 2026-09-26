import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveController } from "@/backend/controllers/emergency-reserve.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("emergency_reserve_suggestions_failed", {
    requestId,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível buscar sugestões agora. Tente novamente.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await emergencyReserveController.suggest(
      await request.json(),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId);
  }
}
