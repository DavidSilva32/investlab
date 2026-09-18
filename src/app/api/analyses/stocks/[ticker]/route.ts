import { randomUUID } from "node:crypto";
import { stockAnalysisController } from "@/backend/controllers/stock-analysis.controller";
import { ApplicationError } from "@/backend/errors/application-error";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const { ticker } = await context.params;
  try {
    return await stockAnalysisController.get(ticker, requestId);
  } catch (error) {
    logger.error("stock_analysis_failed", { requestId, ticker, error });
    const status = error instanceof ApplicationError ? error.statusCode : 502;
    const message =
      error instanceof ApplicationError
        ? error.message
        : "Não foi possível consultar a análise agora.";
    return Response.json(
      { message },
      { status, headers: { "x-request-id": requestId } },
    );
  }
}
