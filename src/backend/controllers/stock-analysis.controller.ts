import { stockAnalysisService } from "@/backend/services/stock-analysis.service";
import { logger } from "@/infrastructure/logging/logger";

export class StockAnalysisController {
  async search(query: string, requestId: string) {
    const results = await stockAnalysisService.searchTickers(query, requestId);
    logger.info("stock_ticker_search_responded", {
      requestId,
      results: results.length,
    });
    return Response.json({ results, requestId });
  }

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

  async getMarket(ticker: string, requestId: string) {
    const market = await stockAnalysisService.getMarketByTicker(
      ticker,
      requestId,
    );
    return Response.json(market, {
      headers: {
        "x-request-id": requestId,
        "cache-control": "private, no-store",
      },
    });
  }

  async getHistory(ticker: string, requestId: string) {
    const history = await stockAnalysisService.getHistoryByTicker(
      ticker,
      requestId,
    );
    return Response.json(history, {
      headers: {
        "x-request-id": requestId,
        "cache-control": "private, no-store",
      },
    });
  }

  async requestFundamentalsRefresh(ticker: string, requestId: string) {
    const market = await stockAnalysisService.getMarketByTicker(
      ticker,
      requestId,
    );
    const result = await stockAnalysisService.requestFundamentalsRefresh(
      market.ticker,
      market.cnpj,
      requestId,
    );
    return { state: result.state, run: result.run };
  }

  async refreshDueFundamentals(requestId: string) {
    return stockAnalysisService.refreshDueFundamentals(requestId);
  }
}
export const stockAnalysisController = new StockAnalysisController();
