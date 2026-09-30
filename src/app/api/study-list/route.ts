import { randomUUID } from "node:crypto";
import { logger } from "@/infrastructure/logging/logger";
import { studyListController } from "@/backend/controllers/study-list.controller";

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
