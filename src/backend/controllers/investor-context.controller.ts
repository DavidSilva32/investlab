import { investorContextService } from "@/backend/services/investor-context.service";
import { logger } from "@/infrastructure/logging/logger";

export class InvestorContextController {
  async get(requestId: string) {
    logger.info("investor_context_requested", { requestId });
    const context = await investorContextService.get(requestId);
    logger.info("investor_context_responded", { requestId });
    return { context };
  }

  async update(body: unknown, requestId: string) {
    logger.info("investor_context_update_requested", { requestId });
    const context = await investorContextService.save(body, requestId);
    logger.info("investor_context_update_responded", { requestId });
    return {
      message: "Objetivo e prazo salvos.",
      context,
    };
  }
}

export const investorContextController = new InvestorContextController();
