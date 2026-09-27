import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
import { studyListController } from "@/backend/controllers/study-list.controller";
import { parseStudyListJsonBody } from "../route-utils";

export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ cnpj: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const { cnpj } = await context.params;
  try {
    return await studyListController.remove(cnpj, requestId);
  } catch (error) {
    logger.error("study_list_remove_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível remover a empresa da Lista de estudo.";
    return Response.json({ message, requestId }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cnpj: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const { cnpj } = await context.params;
  try {
    const body = await parseStudyListJsonBody(request);
    return await studyListController.updateReason(cnpj, body, requestId);
  } catch (error) {
    logger.error("study_list_reason_update_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível atualizar o motivo da inclusão.";
    return Response.json({ message, requestId }, { status });
  }
}
