import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";
import { studyListController } from "@/backend/controllers/study-list.controller";
import { parseStudyListJsonBody } from "./route-utils";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await studyListController.list(requestId);
  } catch (error) {
    logger.error("study_list_load_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      {
        message: "Não foi possível carregar a Lista de estudo agora.",
        requestId,
      },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    const body = await parseStudyListJsonBody(request);
    return await studyListController.add(body, requestId);
  } catch (error) {
    logger.error("study_list_add_failed", {
      requestId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível adicionar a empresa à Lista de estudo.";
    return Response.json({ message, requestId }, { status });
  }
}
