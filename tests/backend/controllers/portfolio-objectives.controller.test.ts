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
const projectionService = vi.hoisted(() => ({ simulate: vi.fn() }));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: service,
}));
vi.mock("@/backend/services/objective-balance.service", () => ({
  objectiveBalanceService: balanceService,
}));
vi.mock("@/backend/services/objective-projection.service", () => ({
  objectiveProjectionService: projectionService,
}));

import { PortfolioObjectivesController } from "@/backend/controllers/portfolio-objectives.controller";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

it("logs the target basis for a required-contribution projection", () => {
  const result = {
    mode: "required_contribution",
    horizonYears: 8,
    targetBasis: "today_purchasing_power",
  };
  projectionService.simulate.mockReturnValue(result);
  const response = new PortfolioObjectivesController().simulateProjection(
    { mode: "required_contribution" },
    "required-projection",
  );
  expect(response.status).toBe(200);
});

describe("PortfolioObjectivesController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an objective projection and logs its assumptions", async () => {
    const result = {
      mode: "project_balance",
      horizonYears: 10,
      targetBasis: "future_nominal",
    };
    projectionService.simulate.mockReturnValue(result);

    const response = new PortfolioObjectivesController().simulateProjection(
      { mode: "project_balance" },
      "projection-request",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(projectionService.simulate).toHaveBeenCalledWith({
      mode: "project_balance",
    });
  });

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
    expect(balanceService.save).toHaveBeenCalledWith(
      {
        objectiveId: "goal-1",
        amount: "10.00",
      },
      "r-balance",
    );
  });

  it("summarizes automatic reserve position transfers after saving", async () => {
    balanceService.save.mockResolvedValue({
      objectiveId: "reserve",
      observedDate: "2026-11-14",
      changedPositionCount: 2,
      newlyLinkedPositionCount: 1,
      transferredPositionCount: 1,
    });

    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: "reserve", amount: "56042.48" },
        "r-reserve",
      );

    await expect(response.json()).resolves.toEqual({
      message:
        "Saldo salvo. 2 vínculos atualizados; 1 posição transferida de outro objetivo para a Reserva.",
    });
  });

  it("explains that a historical balance is saved while current links remain unchanged", async () => {
    balanceService.save.mockResolvedValue({
      objectiveId: "goal-1",
      observedDate: "2026-11-13",
      assignmentStatus: "preserved",
      assignmentReason: "historical_balance",
    });

    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: "goal-1", amount: "56042.48" },
        "r-historical-balance",
      );

    await expect(response.json()).resolves.toEqual({
      message: "Saldo histórico salvo. Os vínculos atuais foram mantidos.",
    });
  });

  it("summarizes automatic regular-objective assignments without exposing the organizer", async () => {
    balanceService.save.mockResolvedValue({
      objectiveId: "goal-1",
      observedDate: "2026-11-14",
      changedPositionCount: 3,
      transferredPositionCount: 0,
      assignmentStatus: "updated",
      objectiveName: "Viagem",
    });

    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: "goal-1", amount: "56042.48" },
        "r-objective-balance",
      );

    await expect(response.json()).resolves.toEqual({
      message:
        "Saldo salvo. 3 vínculos atualizados automaticamente para Viagem; os demais objetivos foram preservados.",
    });
  });

  it.each([
    {
      title: "retains current links after an unavailable recalculation",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        assignmentStatus: "preserved",
        assignmentReason: "calculation_unavailable",
      },
      message:
        "Saldo salvo. Os vínculos atuais foram mantidos porque não foi possível recalcular a distribuição com segurança.",
    },
    {
      title: "uses singular wording for a transferred position",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 1,
        transferredPositionCount: 1,
      },
      message:
        "Saldo salvo. 1 vínculo atualizado; 1 posição transferida de outro objetivo para a Reserva.",
    },
    {
      title: "uses plural wording for multiple transferred positions",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 2,
        transferredPositionCount: 2,
      },
      message:
        "Saldo salvo. 2 vínculos atualizados; 2 posições transferidas de outros objetivos para a Reserva.",
    },
    {
      title: "uses singular wording for a changed regular objective link",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 1,
        transferredPositionCount: 0,
        assignmentStatus: "updated",
        objectiveName: "Viagem",
      },
      message:
        "Saldo salvo. 1 vínculo atualizado automaticamente para Viagem; os demais objetivos foram preservados.",
    },
    {
      title: "uses the fallback name for an updated unnamed objective",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 1,
        transferredPositionCount: 0,
      },
      message:
        "Saldo salvo. 1 vínculo atualizado automaticamente para o objetivo; os demais objetivos foram preservados.",
    },
    {
      title: "summarizes an automatic reserve link update",
      value: {
        objectiveId: reserveObjectiveId,
        observedDate: "2026-11-14",
        changedPositionCount: 1,
        transferredPositionCount: 0,
      },
      message: "Saldo salvo. 1 vínculo da Reserva atualizado automaticamente.",
    },
    {
      title: "uses plural wording for multiple automatic reserve links",
      value: {
        objectiveId: reserveObjectiveId,
        observedDate: "2026-11-14",
        changedPositionCount: 2,
        transferredPositionCount: 0,
      },
      message:
        "Saldo salvo. 2 vínculos da Reserva atualizados automaticamente.",
    },
    {
      title: "reports a reserve assignment that already matches",
      value: {
        objectiveId: reserveObjectiveId,
        observedDate: "2026-11-14",
        changedPositionCount: 0,
        transferredPositionCount: 0,
      },
      message:
        "Saldo salvo. Os vínculos da Reserva já correspondiam às posições mais próximas.",
    },
    {
      title: "uses the generic objective label when no name is available",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 0,
        transferredPositionCount: 0,
      },
      message:
        "Saldo salvo. Os vínculos desse objetivo já correspondiam ao valor informado.",
    },
    {
      title: "reports a regular objective assignment that already matches",
      value: {
        objectiveId: "goal-1",
        observedDate: "2026-11-14",
        changedPositionCount: 0,
        transferredPositionCount: 0,
        objectiveName: "Viagem",
      },
      message:
        "Saldo salvo. Os vínculos de Viagem já correspondiam às posições mais próximas.",
    },
  ])("$title", async ({ value, message }) => {
    balanceService.save.mockResolvedValue(value);

    const response =
      await new PortfolioObjectivesController().saveObservedBalance(
        { objectiveId: value.objectiveId, amount: "500.00" },
        "r-balance-summary",
      );

    await expect(response.json()).resolves.toEqual({ message });
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
