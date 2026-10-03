import { randomUUID } from "node:crypto";
import { ApplicationError } from "@/backend/errors/application-error";
import { stockOpportunityAnalysisController } from "@/backend/controllers/stock-opportunity-analysis.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

function errorResponse(error: unknown, requestId: string) {
  logger.error("stock_opportunity_analysis_route_failed", { requestId, error });
  const status = error instanceof ApplicationError ? error.statusCode : 500;
  const message =
    error instanceof ApplicationError
      ? error.message
      : "Não foi possível carregar as oportunidades da carteira.";
  return Response.json(
    { message, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await stockOpportunityAnalysisController.list(requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  try {
    return await stockOpportunityAnalysisController.saveInput(
      request,
      requestId,
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
