import { randomUUID } from "node:crypto";
import { cdbRateController } from "@/backend/controllers/cdb-rate.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
const failure = (error: unknown, requestId: string) => {
  const expected = error instanceof ApplicationError;
  logger[expected ? "warn" : "error"]("cdb_rate_configuration_failed", {
    requestId,
    error,
  });
  return Response.json(
    {
      message: expected
        ? error.message
        : "Não foi possível salvar a configuração.",
    },
    {
      status: expected ? error.statusCode : 500,
      headers: { "x-request-id": requestId },
    },
  );
};
export async function PUT(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await cdbRateController.update(await request.json(), requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await cdbRateController.create(await request.json(), requestId);
  } catch (error) {
    return failure(error, requestId);
  }
}
