import { financialCardSettlementService } from "@/backend/services/financial-card-settlement.service";
import { logger } from "@/infrastructure/logging/logger";

export class FinancialCardSettlementController {
  async getReview(requestId: string) {
    const data = await financialCardSettlementService.listReview();
    logger.info("financial_card_settlement_review_loaded", {
      requestId,
      pendingCount: data.settlements.length,
      availableCardEntryCount: data.cardEntries.length,
    });
    return Response.json(data);
  }

  async resolve(body: unknown, requestId: string) {
    const data = await financialCardSettlementService.resolve(body);
    logger.info("financial_card_settlement_resolved", {
      requestId,
      resolution: data.resolution,
    });
    return Response.json({ ...data, message: "Conferência salva." });
  }
}

export const financialCardSettlementController =
  new FinancialCardSettlementController();
