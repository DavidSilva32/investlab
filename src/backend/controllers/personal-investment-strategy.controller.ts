import { personalInvestmentStrategyService } from "@/backend/services/personal-investment-strategy.service";
import { logger } from "@/infrastructure/logging/logger";

export class PersonalInvestmentStrategyController {
  async get(requestId: string) {
    const data = await personalInvestmentStrategyService.getOverview(requestId);
    logger.info("personal_investment_strategy_loaded", {
      requestId,
      positionCount: data.totalWealth.positionCount,
    });
    return Response.json(data);
  }

  async save(body: unknown, requestId: string) {
    const strategy = await personalInvestmentStrategyService.save(
      body,
      requestId,
    );
    logger.info("personal_investment_strategy_saved", {
      requestId,
      selectedDirection: strategy.selectedDirection,
    });
    return Response.json({
      message: "Sua direção de estratégia foi salva.",
      strategy,
    });
  }
}

export const personalInvestmentStrategyController =
  new PersonalInvestmentStrategyController();
