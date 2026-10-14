import {
  getApiRequestId,
  withApiRequestLogging,
} from "@/infrastructure/logging/api-request";
import { ApplicationError } from "@/backend/errors/application-error";
import { emergencyReserveController } from "@/backend/controllers/emergency-reserve.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function failure(error: unknown, requestId: string) {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("emergency_reserve_positions_failed", {
    requestId,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível salvar as posições da Reserva.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
}

export const PUT = withApiRequestLogging(
  "PUT",
  "/api/emergency-reserve/positions",
  async function PUT(request: Request) {
    const requestId = getApiRequestId(request);
    try {
      return await emergencyReserveController.updatePositions(
        await request.json(),
        requestId,
      );
    } catch (error) {
      return failure(error, requestId);
    }
  },
);
