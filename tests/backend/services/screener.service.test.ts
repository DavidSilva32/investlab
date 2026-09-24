import { describe, expect, it, vi } from "vitest";
import {
  filtersFromSearchParams,
  ScreenerService,
} from "@/backend/services/screener.service";
import type { ScreenerCompany } from "@/backend/services/screener-metrics";

const now = new Date("2026-09-24T00:00:00Z");
const company: ScreenerCompany = {
  cnpj: "111",
  cvmCode: "1",
  name: "Issuer",
  sector: "Petróleo e Gás",
  quantitativeEligible: true,
  securities: [{ ticker: "AAA3", name: "Issuer ON" }],
  facts: [
    {
      referenceDate: "2025-12-31",
      accountCode: "3.01",
      accountLabel: "Receita de Venda de Bens e/ou Serviços",
      value: "100",
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
    {
      referenceDate: "2025-12-31",
      accountCode: "3.11",
      accountLabel: "Lucro/Prejuízo Consolidado do Período",
      value: "20",
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
    {
      referenceDate: "2025-12-31",
      accountCode: "2.03",
      accountLabel: "Patrimônio Líquido Consolidado",
      value: "100",
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
    {
      referenceDate: "2024-12-31",
      accountCode: "2.03",
      accountLabel: "Patrimônio Líquido Consolidado",
      value: "100",
      documentType: "DFP",
      statementScope: "CONSOLIDATED",
      exerciseOrder: "ULTIMO",
    },
  ],
  marketSnapshot: {
    marketCap: "200",
    observedAt: new Date("2026-09-23T00:00:00Z"),
    classSemanticsValidated: true,
  },
};

describe("ScreenerService", () => {
  it("returns neutral empty local results and zero coverage counts", async () => {
    const repository = {
      getUniverse: vi.fn().mockResolvedValue([]),
      hasSuccessfulSync: vi.fn().mockResolvedValue(false),
    };
    const service = new ScreenerService(repository);
    await expect(service.search({}, "request-1")).resolves.toEqual({
      results: [],
      counts: {
        issuers: 0,
        withNetIncome: 0,
        withEquity: 0,
        withRoe: 0,
        withNetMargin: 0,
        withPe: 0,
        withPb: 0,
      },
      filters: {},
      hasSuccessfulSync: false,
    });
    expect(repository.getUniverse).toHaveBeenCalledOnce();
  });

  it("counts all locally available metric families and applies user filters", async () => {
    const repository = {
      getUniverse: vi.fn().mockResolvedValue([company]),
      hasSuccessfulSync: vi.fn().mockResolvedValue(true),
    };
    const service = new ScreenerService(repository);
    const result = await service.search(
      { maximumPe: 11, maximumPb: 2 },
      "request-2",
    );
    expect(result.counts).toEqual({
      issuers: 1,
      withNetIncome: 1,
      withEquity: 1,
      withRoe: 1,
      withNetMargin: 1,
      withPe: 1,
      withPb: 1,
    });
    expect(result.results).toHaveLength(1);
    expect(result.filters).toEqual({ maximumPe: 11, maximumPb: 2 });
    expect(result.hasSuccessfulSync).toBe(true);
    expect(repository.getUniverse).toHaveBeenCalledOnce();
  });

  it("parses optional numeric and boolean query values while ignoring blanks", () => {
    const params = new URLSearchParams(
      "positiveProfitYears=3&minimumRoe=&minimumNetMargin=5&maximumPe=12&equality=1&equityPositive=true",
    );
    expect(filtersFromSearchParams(params)).toEqual({
      positiveProfitYears: 3,
      minimumNetMargin: 5,
      maximumPe: 12,
      equityPositive: true,
    });
    expect(
      filtersFromSearchParams(new URLSearchParams("equityPositive=false")),
    ).toEqual({ equityPositive: false });
    expect(
      filtersFromSearchParams(new URLSearchParams("equityPositive=other")),
    ).toEqual({});
  });

  it("rejects invalid filters before reading the local universe", async () => {
    const repository = {
      getUniverse: vi.fn().mockResolvedValue([]),
      hasSuccessfulSync: vi.fn().mockResolvedValue(false),
    };
    const service = new ScreenerService(repository);
    await expect(service.search({ maximumPe: 0 })).rejects.toThrow(
      "Revise os filtros do screener.",
    );
    expect(repository.getUniverse).not.toHaveBeenCalled();
  });
});
