import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listLatestPositions: vi.fn(),
  listMovements: vi.fn(),
}));
const estimates = vi.hoisted(() => ({ enrich: vi.fn() }));
const rates = vi.hoisted(() => ({ getReferenceRates: vi.fn() }));
const reserve = vi.hoisted(() => ({ getSummary: vi.fn() }));
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
import { PortfolioService } from "@/backend/services/portfolio.service";

describe("PortfolioService", () => {
  beforeEach(() => vi.clearAllMocks());
  it("coordinates repository data and the valuation services", async () => {
    repository.listLatestPositions.mockResolvedValue([{ id: "p1" }]);
    repository.listMovements.mockResolvedValue([{ id: "m1" }]);
    estimates.enrich.mockResolvedValue([{ id: "p1", estimatedValue: 101 }]);
    rates.getReferenceRates.mockResolvedValue({ selic: null, cdi: null });
    reserve.getSummary.mockResolvedValue({ selectedValue: 0 });
    const service = new PortfolioService();
    await expect(service.getOverview("request-1")).resolves.toMatchObject({
      positions: [{ estimatedValue: 101 }],
      movements: [{ id: "m1" }],
      emergencyReserve: { selectedValue: 0 },
    });
    await expect(service.listPositions("request-2")).resolves.toEqual([
      { id: "p1", estimatedValue: 101 },
    ]);
    expect(repository.listLatestPositions).toHaveBeenCalledWith("request-2");
  });
});
