import { randomUUID } from "node:crypto";
import { stockValuationController } from "@/backend/controllers/stock-valuation.controller";
import { logger } from "@/infrastructure/logging/logger";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const { ticker } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { message: "Envie um corpo JSON válido." },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }
  try {
    return await stockValuationController.calculate(ticker, body, requestId);
  } catch (error) {
    logger.error("stock_valuation_failed", { requestId, ticker, error });
    return Response.json(
      { message: "Não foi possível calcular a avaliação agora." },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}
