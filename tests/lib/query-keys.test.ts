import { describe, expect, it } from "vitest";
import { queryKeys } from "@/lib/query-keys";

describe("queryKeys", () => {
  it("groups portfolio reads under stable portfolio keys", () => {
    expect(queryKeys.portfolio.all).toEqual(["portfolio"]);
    expect(queryKeys.portfolio.overview()).toEqual(["portfolio", "overview"]);
    expect(queryKeys.portfolio.monthlyReview(null)).toEqual([
      "portfolio",
      "monthly-review",
      "latest",
    ]);
    expect(queryKeys.portfolio.monthlyReview("2026-09")).toEqual([
      "portfolio",
      "monthly-review",
      "2026-09",
    ]);
    expect(queryKeys.portfolio.allocation()).toEqual([
      "portfolio",
      "allocation",
    ]);
    expect(queryKeys.portfolio.objectives()).toEqual([
      "portfolio",
      "objectives",
    ]);
    expect(queryKeys.portfolio.emergencyReserve()).toEqual([
      "portfolio",
      "emergency-reserve",
    ]);
    expect(queryKeys.portfolio.strategy()).toEqual(["portfolio", "strategy"]);
    const previewInput = { targetAmount: 1200, valuationDate: "2026-10-09" };
    expect(
      queryKeys.portfolio.positionSuggestions(
        "/api/emergency-reserve/suggestions",
        previewInput,
      ),
    ).toEqual([
      "portfolio",
      "position-combination-suggestions",
      "/api/emergency-reserve/suggestions",
      previewInput,
    ]);
    expect(
      queryKeys.portfolio.objectiveAllocationPreview(previewInput),
    ).toEqual(["portfolio", "objectives", "allocation-preview", previewInput]);
    expect(queryKeys.portfolio.emergencyReservePreview(previewInput)).toEqual([
      "portfolio",
      "emergency-reserve",
      "preview",
      previewInput,
    ]);
  });

  it("includes search and resource identifiers in analysis keys", () => {
    expect(queryKeys.analyses.all).toEqual(["analyses"]);
    expect(queryKeys.analyses.search("PETR")).toEqual([
      "analyses",
      "search",
      "PETR",
    ]);
    expect(queryKeys.analyses.stock("PETR4")).toEqual([
      "analyses",
      "stock",
      "PETR4",
    ]);
    expect(queryKeys.analyses.comparison(["PETR4", "VALE3"])).toEqual([
      "analyses",
      "comparison",
      "PETR4",
      "VALE3",
    ]);
    expect(queryKeys.analyses.screener({ minimumRoe: 10 })).toEqual([
      "analyses",
      "screener",
      { minimumRoe: 10 },
    ]);
    expect(queryKeys.analyses.opportunities()).toEqual([
      "analyses",
      "portfolio-opportunities",
    ]);
  });

  it("groups settings reads under stable settings keys", () => {
    expect(queryKeys.settings.all).toEqual(["settings"]);
    expect(queryKeys.settings.marketData()).toEqual([
      "settings",
      "market-data",
    ]);
    expect(queryKeys.settings.screener()).toEqual(["settings", "screener"]);
  });
});
