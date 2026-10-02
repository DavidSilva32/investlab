import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getOverview: vi.fn(),
  create: vi.fn(),
  updateAssignments: vi.fn(),
  findPositionCombinations: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  previewGlobalAllocation: vi.fn(),
  confirmGlobalAllocation: vi.fn(),
}));
const balanceService = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: service,
}));
vi.mock("@/backend/services/objective-balance.service", () => ({
  objectiveBalanceService: balanceService,
}));

import { PortfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";

describe("PortfolioObjectivesController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the objectives overview", async () => {
    const data = { objectives: [], positions: [] };
    service.getOverview.mockResolvedValue(data);
    const response = await new PortfolioObjectivesController().get("r1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
    expect(service.getOverview).toHaveBeenCalledWith("r1");
  });

  it("creates an objective with a 201 response", async () => {
    const objective = { id: "goal-1", name: "Viagem" };
    service.create.mockResolvedValue(objective);
    const response = await new PortfolioObjectivesController().create(
      { name: "Viagem" },
      "r2",
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(objective);
  });

  it("saves an observed objective balance and logs its date", async () => {
    balanceService.save.mockResolvedValue({
      objectiveId: "goal-1",
      observedDate: "2026-10-01",
    });
    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: "goal-1", amount: "10.00" },
        "r-balance",
      );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "Saldo observado salvo.",
    });
    expect(balanceService.save).toHaveBeenCalledWith({
      objectiveId: "goal-1",
      amount: "10.00",
    });
  });

  it("rejects an assignment request without an objective id", async () => {
    const response =
      await new PortfolioObjectivesController().updateAssignments(
        { assetKeys: [] },
        "r3",
      );
    expect(response.status).toBe(400);
    expect(service.updateAssignments).not.toHaveBeenCalled();
  });

  it("updates assignments for the supplied objective", async () => {
    const body = { objectiveId: "goal-1", assetKeys: ["asset-a"] };
    service.updateAssignments.mockResolvedValue(undefined);
    const response =
      await new PortfolioObjectivesController().updateAssignments(body, "r4");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Posições do objetivo atualizadas.",
    });
    expect(service.updateAssignments).toHaveBeenCalledWith("goal-1", body);
  });

  it("returns position combination candidates", async () => {
    const result = { status: "suggestions", candidates: [] };
    service.findPositionCombinations.mockResolvedValue(result);
    const response = await new PortfolioObjectivesController().suggestions(
      { targetAmount: 100 },
      "r5",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(service.findPositionCombinations).toHaveBeenCalledWith(
      { targetAmount: 100 },
      "r5",
    );
  });

  it("returns the global allocation preview and logs its safe summary", async () => {
    const data = {
      objectives: [{ objectiveId: "goal-a" }],
      allocation: { asset: "goal-a" },
      optimal: true,
    };
    service.previewGlobalAllocation.mockResolvedValue(data);
    const body = { valuationDate: "2026-10-01", balances: [] };
    const response =
      await new PortfolioObjectivesController().previewAllocation(
        body,
        "r-allocation-preview",
      );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
    expect(service.previewGlobalAllocation).toHaveBeenCalledWith(
      body,
      "r-allocation-preview",
    );
  });

  it("confirms a global allocation and returns the saved reference batch", async () => {
    service.confirmGlobalAllocation.mockResolvedValue({ batchId: "batch-1" });
    const body = { allocation: { asset: "goal-a" } };
    const response =
      await new PortfolioObjectivesController().confirmAllocation(
        body,
        "r-allocation-confirm",
      );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "A distribuição foi salva.",
      batchId: "batch-1",
    });
    expect(service.confirmGlobalAllocation).toHaveBeenCalledWith(
      body,
      "r-allocation-confirm",
    );
  });

  it("reports an empty suggestion result without counting candidates", async () => {
    const result = { status: "unavailable", candidates: undefined };
    service.findPositionCombinations.mockResolvedValue(result);
    const response = await new PortfolioObjectivesController().suggestions(
      { targetAmount: 500 },
      "r9",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it("updates objective details and deletes a custom objective", async () => {
    const objective = { id: "goal-1", name: "Carro" };
    service.update.mockResolvedValue(objective);
    service.delete.mockResolvedValue(objective);
    const controller = new PortfolioObjectivesController();

    const updateResponse = await controller.update(
      { objectiveId: "goal-1", name: "Carro" },
      "r6",
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toEqual(objective);
    expect(service.update).toHaveBeenCalledWith("goal-1", {
      objectiveId: "goal-1",
      name: "Carro",
    });

    const deleteResponse = await controller.delete("goal-1", "r7");
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({
      message: "Objetivo excluído.",
    });
  });

  it("rejects an update without an objective id", async () => {
    const response = await new PortfolioObjectivesController().update(
      { name: "Carro" },
      "r8",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Objetivo não encontrado.",
    });
    expect(service.update).not.toHaveBeenCalled();
  });
});
