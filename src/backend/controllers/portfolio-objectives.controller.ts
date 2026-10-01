import { logger } from "@/infrastructure/logging/logger";
import { portfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";

export class PortfolioObjectivesController {
  async get(requestId: string) {
    const data = await portfolioObjectivesService.getOverview(requestId);
    logger.info("portfolio_objectives_loaded", {
      requestId,
      objectives: data.objectives.length,
      positions: data.positions.length,
    });
    return Response.json(data);
  }

  async create(body: unknown, requestId: string) {
    const objective = await portfolioObjectivesService.create(body);
    logger.info("portfolio_objective_created", {
      requestId,
      objectiveId: objective.id,
    });
    return Response.json(objective, { status: 201 });
  }

  async updateAssignments(body: unknown, requestId: string) {
    const input = body as { objectiveId?: unknown };
    if (typeof input?.objectiveId !== "string") {
      return Response.json(
        { message: "Objetivo não encontrado." },
        { status: 400 },
      );
    }
    await portfolioObjectivesService.updateAssignments(input.objectiveId, body);
    logger.info("portfolio_objective_positions_updated", {
      requestId,
      objectiveId: input.objectiveId,
    });
    return Response.json({ message: "Posições do objetivo atualizadas." });
  }
  async suggestions(body: unknown, requestId: string) {
    const data = await portfolioObjectivesService.findPositionCombinations(
      body,
      requestId,
    );
    logger.info("portfolio_objective_position_suggestions_generated", {
      requestId,
      status: data.status,
      candidates: data.status === "suggestions" ? data.candidates.length : 0,
    });
    return Response.json(data);
  }

  async previewAllocation(body: unknown, requestId: string) {
    const data = await portfolioObjectivesService.previewGlobalAllocation(
      body,
      requestId,
    );
    logger.info("portfolio_objective_allocation_previewed", {
      requestId,
      objectives: data.objectives.length,
      positions: Object.keys(data.allocation).length,
      optimal: data.optimal,
    });
    return Response.json(data);
  }

  async confirmAllocation(body: unknown, requestId: string) {
    const data = await portfolioObjectivesService.confirmGlobalAllocation(
      body,
      requestId,
    );
    logger.info("portfolio_objective_allocation_confirmed", {
      requestId,
      batchId: data.batchId,
    });
    return Response.json({
      message: "A distribuição foi salva.",
      batchId: data.batchId,
    });
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
    logger.info("portfolio_objective_updated", {
      requestId,
      objectiveId: objective.id,
    });
    return Response.json(objective);
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
