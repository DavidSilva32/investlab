import { stockValuationService } from "@/backend/services/stock-valuation.service";
import { logger } from "@/infrastructure/logging/logger";

export class StockValuationController {
  async calculate(ticker: string, body: unknown, requestId: string) {
    logger.info("stock_valuation_requested", { requestId, ticker });
    const valuation = await stockValuationService.calculate(ticker, body);
    logger.info("stock_valuation_responded", {
      requestId,
      ticker,
      status: valuation.status,
      scenarios: valuation.scenarios.length,
    });
    return Response.json(
      { ticker, ...valuation },
      { headers: { "x-request-id": requestId } },
    );
  }
}

export const stockValuationController = new StockValuationController();
