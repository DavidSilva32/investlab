import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getOverview: vi.fn(),
  save: vi.fn(),
  saveComposition: vi.fn(),
  simulateContribution: vi.fn(),
}));
const logger = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/backend/services/personal-investment-strategy.service", () => ({
  personalInvestmentStrategyService: service,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { PersonalInvestmentStrategyController } from "@/backend/controllers/personal-investment-strategy.controller";

describe("PersonalInvestmentStrategyController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns strategy facts and logs the evaluated position count", async () => {
    const data = { totalWealth: { positionCount: 4 } };
    service.getOverview.mockResolvedValue(data);
    const response = await new PersonalInvestmentStrategyController().get(
      "req-get",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data);
    expect(logger.info).toHaveBeenCalledWith(
      "personal_investment_strategy_loaded",
      {
        requestId: "req-get",
        positionCount: 4,
      },
    );
  });

  it("persists the choice and returns a client-safe success message", async () => {
    const strategy = {
      answers: { horizonYears: 5, internationalInterest: "unsure" },
      selectedDirection: "review_horizon",
      updatedAt: "2026-10-02T10:00:00.000Z",
    };
    service.save.mockResolvedValue(strategy);
    const response = await new PersonalInvestmentStrategyController().save(
      { selectedDirection: "review_horizon" },
      "req-save",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Sua direção de estratégia foi salva.",
      strategy,
    });
    expect(service.save).toHaveBeenCalledWith(
      { selectedDirection: "review_horizon" },
      "req-save",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "personal_investment_strategy_saved",
      {
        requestId: "req-save",
        selectedDirection: "review_horizon",
      },
    );
  });

  it("saves the chosen composition without returning legacy survey fields", async () => {
    const allocationPercentages = {
      fixed_income: 60,
      brazilian_equities: 40,
      international_etfs: 0,
      fiis: 0,
    };
    service.saveComposition.mockResolvedValue(allocationPercentages);
    const response = await new PersonalInvestmentStrategyController().save(
      { allocationPercentages },
      "req-composition",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Sua composição de longo prazo foi salva.",
      allocationPercentages,
    });
    expect(service.saveComposition).toHaveBeenCalledWith(
      { allocationPercentages },
      "req-composition",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "personal_investment_strategy_allocation_saved",
      { requestId: "req-composition" },
    );
  });

  it("returns a contribution simulation and logs completeness", async () => {
    const simulation = { completeness: { complete: false } };
    service.simulateContribution.mockResolvedValue(simulation);
    const response =
      await new PersonalInvestmentStrategyController().simulateContribution(
        { contributionAmount: 100 },
        "req-simulation",
      );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(simulation);
    expect(service.simulateContribution).toHaveBeenCalledWith(
      { contributionAmount: 100 },
      "req-simulation",
    );
    expect(logger.info).toHaveBeenCalledWith(
      "personal_investment_strategy_contribution_simulated",
      { requestId: "req-simulation", complete: false },
    );
  });
});
