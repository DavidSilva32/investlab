import { randomUUID } from "node:crypto";
import { portfolioController } from "@/backend/controllers/portfolio.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await portfolioController.overview(requestId);
  } catch (error) {
    logger.error("portfolio_overview_failed", { requestId, error });
    return Response.json(
      { message: "Não foi possível consultar a carteira." },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
