import { beforeEach, describe, expect, it, vi } from "vitest";

const objectivesService = vi.hoisted(() => ({
  getOverview: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const balanceService = vi.hoisted(() => ({ save: vi.fn() }));
const projectionService = vi.hoisted(() => ({ simulate: vi.fn() }));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: objectivesService,
}));
vi.mock("@/backend/services/objective-balance.service", () => ({
  objectiveBalanceService: balanceService,
}));
vi.mock("@/backend/services/objective-projection.service", () => ({
  objectiveProjectionService: projectionService,
}));

import { PortfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";

describe("PortfolioObjectivesController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the objectives as balance tracking data without position links", async () => {
    objectivesService.getOverview.mockResolvedValue({
      objectives: [
        {
          id: "goal-1",
          updatedAt: "2026-11-14T00:00:00.000Z",
          kind: "CUSTOM",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 16000,
          monthlyPlannedAmount: 2000,
          currentValue: 12304.56,
          remainingAmount: 3695.44,
          progressPercent: 76.9,
          balanceTracking: {
            observedAmountCents: "1230456",
            observedOn: "2026-11-14",
          },
          knownValue: 0,
          assignedAssetKeys: ["legacy:asset"],
        },
      ],
      positions: [{ assetKey: "legacy:asset" }],
      destinationSummary: { total: 12304.56 },
    });

    const response = await new PortfolioObjectivesController().get("read-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      objectives: [
        {
          id: "goal-1",
          kind: "CUSTOM",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 16000,
          monthlyPlannedAmount: 2000,
          currentValue: 12304.56,
          remainingAmount: 3695.44,
          progressPercent: 76.9,
          balanceTracking: {
            observedAmountCents: "1230456",
            observedOn: "2026-11-14",
          },
        },
      ],
    });
    expect(objectivesService.getOverview).toHaveBeenCalledWith("read-1");
  });

  it("creates a goal and omits the owner identifier from the response", async () => {
    objectivesService.create.mockResolvedValue({
      id: "goal-2",
      name: "Carro",
      userId: "user-secret",
    });

    const response = await new PortfolioObjectivesController().create(
      { name: "Carro" },
      "create-1",
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: "goal-2",
      name: "Carro",
    });
    expect(objectivesService.create).toHaveBeenCalledWith({ name: "Carro" });
  });

  it("updates and deletes a goal", async () => {
    const goal = { id: "goal-1", name: "Viagem", userId: "user-secret" };
    objectivesService.update.mockResolvedValue(goal);
    objectivesService.delete.mockResolvedValue(goal);
    const controller = new PortfolioObjectivesController();

    const update = await controller.update(
      { objectiveId: "goal-1", name: "Viagem" },
      "update-1",
    );
    expect(update.status).toBe(200);
    await expect(update.json()).resolves.toEqual({
      id: "goal-1",
      name: "Viagem",
    });
    expect(objectivesService.update).toHaveBeenCalledWith("goal-1", {
      objectiveId: "goal-1",
      name: "Viagem",
    });

    const deletion = await controller.delete("goal-1", "delete-1");
    expect(deletion.status).toBe(200);
    await expect(deletion.json()).resolves.toEqual({
      message: "Objetivo excluído.",
    });
  });

  it("rejects updates without an objective id", async () => {
    const response = await new PortfolioObjectivesController().update(
      { name: "Viagem" },
      "update-2",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Objetivo não encontrado.",
    });
    expect(objectivesService.update).not.toHaveBeenCalled();
  });

  it("saves an observed balance without changing position links", async () => {
    balanceService.save.mockResolvedValue({
      objectiveId: "goal-1",
      observedDate: "2026-11-14",
    });

    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: "goal-1", amount: "56042.48", observedOn: "2026-11-14" },
        "balance-1",
      );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "Saldo atualizado. As posições da carteira não foram alteradas.",
    });
    expect(balanceService.save).toHaveBeenCalledWith(
      { objectiveId: "goal-1", amount: "56042.48", observedOn: "2026-11-14" },
      "balance-1",
    );
  });

  it("returns a goal projection from the projection service", async () => {
    const result = { mode: "project_balance", horizonYears: 10 };
    projectionService.simulate.mockReturnValue(result);

    const response = new PortfolioObjectivesController().simulateProjection(
      { mode: "project_balance" },
      "projection-1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(projectionService.simulate).toHaveBeenCalledWith({
      mode: "project_balance",
    });
  });

  it("logs the target basis when simulating a required contribution", async () => {
    const result = {
      mode: "required_contribution",
      horizonYears: 12,
      targetBasis: "today_purchasing_power",
    };
    projectionService.simulate.mockReturnValue(result);

    const response = new PortfolioObjectivesController().simulateProjection(
      { mode: "required_contribution" },
      "projection-required-1",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(logger.info).toHaveBeenCalledWith(
      "portfolio_objective_projection_calculated",
      {
        requestId: "projection-required-1",
        mode: "required_contribution",
        horizonYears: 12,
        targetBasis: "today_purchasing_power",
      },
    );
  });
});
