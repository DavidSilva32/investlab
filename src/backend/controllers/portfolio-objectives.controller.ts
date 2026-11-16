import { logger } from "@/infrastructure/logging/logger";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { objectiveBalanceService } from "@/backend/services/objective-balance.service";
import { objectiveProjectionService } from "@/backend/services/objective-projection.service";

export class PortfolioObjectivesController {
  simulateProjection(body: unknown, requestId: string) {
    const data = objectiveProjectionService.simulate(body);
    logger.info("portfolio_objective_projection_calculated", {
      requestId,
      mode: data.mode,
      horizonYears: data.horizonYears,
      ...(data.mode === "required_contribution"
        ? { targetBasis: data.targetBasis }
        : {}),
    });
    return Response.json(data);
  }

  async get(requestId: string) {
    const data = await portfolioObjectivesService.getOverview(requestId);
    logger.info("portfolio_objectives_loaded", {
      requestId,
      objectives: data.objectives.length,
    });
    return Response.json({
      objectives: data.objectives.map((objective) => ({
        id: objective.id,
        kind: objective.kind,
        purpose: objective.purpose,
        name: objective.name,
        targetAmount: objective.targetAmount,
        monthlyPlannedAmount: objective.monthlyPlannedAmount,
        currentValue: objective.currentValue,
        remainingAmount: objective.remainingAmount,
        progressPercent: objective.progressPercent,
        balanceTracking: objective.balanceTracking,
      })),
    });
  }

  async create(body: unknown, requestId: string) {
    const objective = await portfolioObjectivesService.create(body);
    const { userId, ...responseObjective } = objective;
    void userId;
    logger.info("portfolio_objective_created", {
      requestId,
      objectiveId: objective.id,
    });
    return Response.json(responseObjective, { status: 201 });
  }

  async update(body: unknown, requestId: string) {
    const input = body as { objectiveId?: unknown };
    if (typeof input?.objectiveId !== "string") {
      return Response.json(
        { message: "Objetivo não encontrado." },
        { status: 400 },
      );
    }
    const objective = await portfolioObjectivesService.update(
      input.objectiveId,
      body,
    );
    const { userId, ...responseObjective } = objective;
    void userId;
    logger.info("portfolio_objective_updated", {
      requestId,
      objectiveId: objective.id,
    });
    return Response.json(responseObjective);
  }

  async saveObservedBalance(body: unknown, requestId: string) {
    const reference = await objectiveBalanceService.save(body, requestId);
    logger.info("portfolio_objective_balance_saved", {
      requestId,
      objectiveId: reference.objectiveId,
      observedOn: reference.observedDate,
    });
    return Response.json(
      {
        message:
          "Saldo atualizado. As posições da carteira não foram alteradas.",
      },
      { status: 201 },
    );
  }

  async delete(objectiveId: string, requestId: string) {
    const objective = await portfolioObjectivesService.delete(objectiveId, {
      objectiveId,
    });
    logger.info("portfolio_objective_deleted", {
      requestId,
      objectiveId: objective.id,
    });
    return Response.json({ message: "Objetivo excluído." });
  }
}

export const portfolioObjectivesController =
  new PortfolioObjectivesController();
