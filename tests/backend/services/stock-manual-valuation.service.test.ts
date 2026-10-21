import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listByTicker: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock(
  "@/backend/repositories/stock-opportunity-manual-input.repository",
  () => ({
    stockOpportunityManualInputRepository: repository,
  }),
);

import { ApplicationError } from "@/backend/errors/application-error";
import { StockManualValuationService } from "@/backend/services/stock-manual-valuation.service";

describe("StockManualValuationService", () => {
  const service = new StockManualValuationService(repository);

  beforeEach(() => vi.clearAllMocks());

  it("returns only per-share valuation inputs for the normalized ticker", async () => {
    repository.listByTicker.mockResolvedValue([
      {
        inputKey: "analysis_ltm_eps",
        value: "3.25",
        source: "Relações com Investidores",
        asOf: "2026-06-30",
      },
      {
        inputKey: "analysis_bvps",
        value: "12.4",
        source: "DFP publicado",
        asOf: "2025-12-31",
      },
      {
        inputKey: "graham_eps",
        value: "2.9",
        source: "Balanço usado no Graham",
        asOf: "2025-12-31",
      },
      {
        inputKey: "graham_book_value_per_share",
        value: "11.7",
        source: "Balanço usado no Graham",
        asOf: "2025-12-31",
      },
      {
        inputKey: "bazin_dividend_per_share",
        value: "1.2",
        source: "RI",
        asOf: "2026-06-30",
      },
    ]);
    await expect(service.list(" itub4 ")).resolves.toEqual({
      ticker: "ITUB4",
      inputs: [
        {
          inputKey: "analysis_ltm_eps",
          value: 3.25,
          source: "Relações com Investidores",
          asOf: "2026-06-30",
        },
        {
          inputKey: "analysis_bvps",
          value: 12.4,
          source: "DFP publicado",
          asOf: "2025-12-31",
        },
      ],
    });
    expect(repository.listByTicker).toHaveBeenCalledWith("ITUB4");
  });

  it("rejects invalid tickers before reading owner-scoped inputs", async () => {
    await expect(service.list("CEMIG4?")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.listByTicker).not.toHaveBeenCalled();
  });

  it("saves normalized, sourced per-share values without requiring a portfolio position", async () => {
    repository.upsert.mockImplementation(async (input) => ({
      ...input,
      value: input.value.toFixed(8),
    }));
    await expect(
      service.save("itub4", "analysis_ltm_eps", {
        value: 3.25,
        source: "  Relações com Investidores  ",
        asOf: "2026-06-30",
      }),
    ).resolves.toEqual({
      inputKey: "analysis_ltm_eps",
      value: 3.25,
      source: "Relações com Investidores",
      asOf: "2026-06-30",
    });
    expect(repository.upsert).toHaveBeenCalledWith({
      ticker: "ITUB4",
      inputKey: "analysis_ltm_eps",
      value: 3.25,
      source: "Relações com Investidores",
      asOf: "2026-06-30",
    });
  });

  it("keeps a negative LPA as reported instead of fabricating a positive multiple", async () => {
    repository.upsert.mockImplementation(async (input) => ({
      ...input,
      value: input.value.toFixed(8),
    }));
    await expect(
      service.save("ITUB4", "analysis_ltm_eps", {
        value: -0.75,
        source: "Relatório anual",
        asOf: "2025-12-31",
      }),
    ).resolves.toMatchObject({ inputKey: "analysis_ltm_eps", value: -0.75 });
  });

  it.each([
    [
      "bad ticker",
      "!",
      "analysis_ltm_eps",
      { value: 1, source: "RI", asOf: "2026-06-30" },
    ],
    [
      "unsupported input",
      "ITUB4",
      "bazin_dividend_per_share",
      { value: 1, source: "RI", asOf: "2026-06-30" },
    ],
    [
      "non-positive book value per share",
      "ITUB4",
      "analysis_bvps",
      { value: 0, source: "RI", asOf: "2026-06-30" },
    ],
    [
      "missing source",
      "ITUB4",
      "analysis_ltm_eps",
      { value: 1, source: "", asOf: "2026-06-30" },
    ],
    [
      "invalid reference date",
      "ITUB4",
      "analysis_ltm_eps",
      { value: 1, source: "RI", asOf: "2026-02-30" },
    ],
  ])("rejects %s", async (_label, ticker, inputKey, body) => {
    await expect(service.save(ticker, inputKey, body)).rejects.toBeInstanceOf(
      ApplicationError,
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
