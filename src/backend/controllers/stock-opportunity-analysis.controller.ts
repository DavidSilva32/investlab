import { logger } from "@/infrastructure/logging/logger";
import { stockOpportunityAnalysisService } from "@/backend/services/stock-opportunity-analysis.service";
import type { StockOpportunityInputKey } from "@/backend/repositories/stock-opportunity-manual-input.repository";

export class StockOpportunityAnalysisController {
  async list(requestId: string) {
    logger.info("stock_opportunity_analysis_requested", { requestId });
    const result = await stockOpportunityAnalysisService.list(requestId);
    logger.info("stock_opportunity_analysis_loaded", {
      requestId,
      opportunities: result.opportunities.length,
    });
    return Response.json({ ...result, requestId });
  }

  async saveInput(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const saved = await stockOpportunityAnalysisService.saveInput(
      body,
      requestId,
    );
    return Response.json({ ...saved, requestId });
  }

  async saveBazinTargetYield(request: Request, requestId: string) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const result = await stockOpportunityAnalysisService.saveBazinTargetYield(
      typeof body === "object" && body !== null && "bazinTargetYield" in body
        ? body.bazinTargetYield
        : null,
      requestId,
    );
    return Response.json({ ...result, requestId });
  }

  async deleteInput(ticker: string, inputKey: string, requestId: string) {
    const deleted = await stockOpportunityAnalysisService.deleteInput(
      ticker,
      inputKey as StockOpportunityInputKey,
      requestId,
    );
    return Response.json({ ...deleted, requestId });
  }
}

export const stockOpportunityAnalysisController =
  new StockOpportunityAnalysisController();
