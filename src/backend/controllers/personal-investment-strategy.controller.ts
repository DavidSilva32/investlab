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
    if (
      body !== null &&
      typeof body === "object" &&
      "activateContributionPlanning" in body &&
      (body as { activateContributionPlanning?: unknown })
        .activateContributionPlanning === true
    ) {
      const activation =
        await personalInvestmentStrategyService.activateAllocation(requestId);
      logger.info("personal_investment_strategy_allocation_activated", {
        requestId,
      });
      return Response.json({
        message:
          "A Estratégia agora orienta o planejamento de aportes de Longo Prazo. As seis metas antigas foram preservadas.",
        ...activation,
      });
    }
    if (
      body !== null &&
      typeof body === "object" &&
      "allocationPercentages" in body
    ) {
      const allocationPercentages =
        await personalInvestmentStrategyService.saveComposition(
          body,
          requestId,
        );
      logger.info("personal_investment_strategy_allocation_saved", {
        requestId,
      });
      return Response.json({
        message: "Sua composição de longo prazo foi salva.",
        allocationPercentages,
      });
    }
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

  async simulateContribution(body: unknown, requestId: string) {
    const simulation =
      await personalInvestmentStrategyService.simulateContribution(
        body,
        requestId,
      );
    logger.info("personal_investment_strategy_contribution_simulated", {
      requestId,
      complete: simulation.simulation?.completeness.complete ?? false,
    });
    return Response.json(simulation);
  }
}

export const personalInvestmentStrategyController =
  new PersonalInvestmentStrategyController();
