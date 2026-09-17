import { randomUUID } from "node:crypto";
import { importRepository } from "@/backend/repositories/import.repository";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return Response.json(await importRepository.listLatestPositions(requestId));
  } catch (error) {
    logger.error("positions_query_failed", { requestId, error });
    return Response.json(
      { message: "Não foi possível consultar as posições." },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
