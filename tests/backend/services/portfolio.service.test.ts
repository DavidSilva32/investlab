import { beforeEach, describe, expect, it, vi } from "vitest";
const repository = vi.hoisted(() => ({
  listLatestPositions: vi.fn(),
  listMovements: vi.fn(),
}));
const estimates = vi.hoisted(() => ({ enrich: vi.fn() }));
const rates = vi.hoisted(() => ({ getReferenceRates: vi.fn() }));
const reserve = vi.hoisted(() => ({ getSummary: vi.fn() }));
const allocation = vi.hoisted(() => ({
  classifyPositions: vi.fn(),
  getAllocationTargets: vi.fn(),
}));
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: repository,
}));
vi.mock("@/backend/services/cdb-estimate.service", () => ({
  cdbEstimateService: estimates,
}));
vi.mock("@/backend/services/bcb-reference-rates.service", () => ({
  bcbReferenceRatesService: rates,
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: reserve,
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: allocation,
}));
import { PortfolioService } from "@/backend/services/portfolio.service";
import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

describe("PortfolioService", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads positions and estimates once, then shares them for allocation, reserve and guidance", async () => {
    const rawPositions = [{ id: "p1" }];
    const estimated = [{ id: "p1", estimatedValue: 100, totalValue: "100" }];
    const classified = [
      { ...estimated[0], classification: { assetClass: "Renda fixa" } },
    ];
    const targets = Object.fromEntries(
      portfolioAssetClassOptions.map((assetClass) => [
        assetClass,
        assetClass === "Renda fixa" ? 100 : 0,
      ]),
    );
    repository.listLatestPositions.mockResolvedValue(rawPositions);
    repository.listMovements.mockResolvedValue([{ id: "m1" }]);
    estimates.enrich.mockResolvedValue(estimated);
    allocation.classifyPositions.mockResolvedValue(classified);
    allocation.getAllocationTargets.mockResolvedValue(targets);
    rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
    reserve.getSummary.mockResolvedValue({
      selectedValue: 0,
      unvaluedGroups: 0,
      missingSelectionCount: 0,
      status: "on_target",
      difference: 0,
    });
    const service = new PortfolioService();
    await expect(service.getOverview("request-1")).resolves.toMatchObject({
      positions: classified,
      movements: [{ id: "m1" }],
      emergencyReserve: { selectedValue: 0 },
      nextContributionGuidance: { status: "no_gap" },
    });
    expect(repository.listLatestPositions).toHaveBeenCalledTimes(1);
    expect(estimates.enrich).toHaveBeenCalledWith(rawPositions);
    expect(allocation.classifyPositions).toHaveBeenCalledWith(
      estimated,
      "request-1",
    );
    expect(allocation.getAllocationTargets).toHaveBeenCalledWith("request-1");
    expect(reserve.getSummary).toHaveBeenCalledWith(classified, "request-1");
    await expect(service.listPositions("request-2")).resolves.toEqual(
      estimated,
    );
    expect(repository.listLatestPositions).toHaveBeenCalledWith("request-2");
  });
  it.each(["classification", "targets", "emergency_reserve"] as const)(
    "keeps the dashboard available when the %s lookup fails",
    async (failedLookup) => {
      const estimated = [{ id: "p1", estimatedValue: 100, totalValue: "100" }];
      const classified = [
        { ...estimated[0], classification: { assetClass: "Renda fixa" } },
      ];
      repository.listLatestPositions.mockResolvedValue([{ id: "p1" }]);
      repository.listMovements.mockResolvedValue([]);
      estimates.enrich.mockResolvedValue(estimated);
      rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
      reserve.getSummary.mockResolvedValue({
        unvaluedGroups: 0,
        missingSelectionCount: 0,
        status: "not_configured",
        difference: null,
      });
      allocation.classifyPositions.mockResolvedValue(classified);
      allocation.getAllocationTargets.mockResolvedValue({});
      if (failedLookup === "classification")
        allocation.classifyPositions.mockRejectedValue(
          new Error("private classification failure"),
        );
      else if (failedLookup === "targets")
        allocation.getAllocationTargets.mockRejectedValue(
          new Error("private target failure"),
        );
      else
        reserve.getSummary.mockRejectedValue(
          new Error("private emergency reserve failure"),
        );
      const result = await new PortfolioService().getOverview("request-2");
      expect(result.nextContributionGuidance).toMatchObject({
        status: "unavailable",
      });
      expect(result.positions).toEqual(
        failedLookup === "classification" ? estimated : classified,
      );
      if (failedLookup === "targets")
        expect(result.emergencyReserve).toBeDefined();
      else expect(result.emergencyReserve).toBeUndefined();
      if (failedLookup === "classification")
        expect(reserve.getSummary).not.toHaveBeenCalled();
      expect(estimates.enrich).toHaveBeenCalledWith([{ id: "p1" }]);
    },
  );
});
