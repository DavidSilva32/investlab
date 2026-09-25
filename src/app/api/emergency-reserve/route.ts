import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveController } from "@/backend/controllers/emergency-reserve.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(
  error: unknown,
  requestId: string,
  operation: "read" | "save",
) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("emergency_reserve_failed", {
    requestId,
    operation,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : operation === "read"
          ? "Não foi possível consultar a reserva."
          : "Não foi possível salvar a reserva.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await emergencyReserveController.get(requestId);
  } catch (error) {
    return failure(error, requestId, "read");
  }
}

export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await emergencyReserveController.update(
      await request.json(),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "save");
  }
}
