import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { importController } from "@/backend/controllers/import.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function DELETE(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await importController.delete(
      new URL(request.url).searchParams.get("documentType"),
      requestId,
    );
  } catch (error) {
    const expected = error instanceof ApplicationError;
    logger[expected ? "warn" : "error"](
      expected ? "b3_import_deletion_rejected" : "b3_import_deletion_failed",
      { requestId, error },
    );
    return Response.json(
      {
        message: expected
          ? error.message
          : "Não foi possível excluir os dados.",
      },
      {
        status: expected ? error.statusCode : 500,
        headers: { "x-request-id": requestId },
      },
    );
  }
}
