import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listReview: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@/backend/repositories/financial-card-settlement.repository", () => ({
  financialCardSettlementRepository: repository,
}));

import { FinancialCardSettlementService } from "@/backend/services/financial-card-settlement.service";

describe("FinancialCardSettlementService", () => {
  const service = new FinancialCardSettlementService();

  beforeEach(() => vi.resetAllMocks());

  it("returns the repository's review candidates", async () => {
    const review = { settlements: [{ id: "invoice" }], cardEntries: [] };
    repository.listReview.mockResolvedValue(review);
    await expect(service.listReview()).resolves.toBe(review);
  });

  it.each([
    null,
    {},
    {
      settlementEntryId: "11111111-1111-4111-8111-111111111111",
      resolution: "LINKED",
      cardEntryIds: [],
    },
    {
      settlementEntryId: "11111111-1111-4111-8111-111111111111",
      resolution: "NOT_RELATED",
      cardEntryIds: ["22222222-2222-4222-8222-222222222222"],
    },
  ])("rejects invalid settlement decisions", async (input) => {
    await expect(service.resolve(input)).rejects.toMatchObject({
      statusCode: 400,
      message: "Revise a decisão e as compras selecionadas.",
    });
    expect(repository.resolve).not.toHaveBeenCalled();
  });

  it("rejects duplicate purchases before persistence", async () => {
    const purchaseId = "22222222-2222-4222-8222-222222222222";
    await expect(
      service.resolve({
        settlementEntryId: "11111111-1111-4111-8111-111111111111",
        resolution: "LINKED",
        cardEntryIds: [purchaseId, purchaseId],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.resolve).not.toHaveBeenCalled();
  });

  it("passes a valid explicit link or no-match decision to the repository", async () => {
    repository.resolve.mockImplementation(async (input) => ({
      resolution: input.resolution,
    }));
    const linked = {
      settlementEntryId: "11111111-1111-4111-8111-111111111111",
      resolution: "LINKED",
      cardEntryIds: ["22222222-2222-4222-8222-222222222222"],
    };
    const noMatch = {
      settlementEntryId: "33333333-3333-4333-8333-333333333333",
      resolution: "NOT_RELATED",
      cardEntryIds: [],
    };
    await expect(service.resolve(linked)).resolves.toEqual({
      resolution: "LINKED",
    });
    await expect(service.resolve(noMatch)).resolves.toEqual({
      resolution: "NOT_RELATED",
    });
    expect(repository.resolve).toHaveBeenNthCalledWith(1, linked);
    expect(repository.resolve).toHaveBeenNthCalledWith(2, noMatch);
  });
});
