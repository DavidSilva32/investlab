import { stockComparisonService } from "@/backend/services/stock-comparison.service";
import { logger } from "@/infrastructure/logging/logger";

export class StockComparisonController {
  async compare(body: unknown, requestId: string) {
    const result = await stockComparisonService.compare(body, requestId);
    logger.info("stock_comparison_completed", {
      requestId,
      issuerCount: result.companies.length,
      sector: result.sector,
    });
    return Response.json(result, { headers: { "x-request-id": requestId } });
  }
}

export const stockComparisonController = new StockComparisonController();
