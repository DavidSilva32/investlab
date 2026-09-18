import { stockAnalysisService } from "@/backend/services/stock-analysis.service";
import { logger } from "@/infrastructure/logging/logger";

export class StockAnalysisController {
  async get(ticker: string, requestId: string) {
    logger.info("stock_analysis_requested", { requestId, ticker });
    const analysis = await stockAnalysisService.getByTicker(ticker, requestId);
    logger.info("stock_analysis_responded", {
      requestId,
      ticker: analysis.ticker,
      fundamentals: analysis.fundamentals.length,
    });
    return Response.json(analysis);
  }
}
export const stockAnalysisController = new StockAnalysisController();
