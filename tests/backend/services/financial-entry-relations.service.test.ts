import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const repository = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/backend/repositories/financial-entry-relations.repository", () => ({
  financialEntryRelationsRepository: repository,
}));

import { FinancialEntryRelationsService } from "@/backend/services/financial-entry-relations.service";

describe("FinancialEntryRelationsService", () => {
  const service = new FinancialEntryRelationsService();

  beforeEach(() => vi.resetAllMocks());

  it("validates input and delegates a valid explicit relation", async () => {
    const input = {
      kind: "TRANSFER",
      entryId: "11111111-1111-4111-8111-111111111111",
      relatedEntryId: "22222222-2222-4222-8222-222222222222",
    } as const;
    repository.create.mockResolvedValue({
      id: "relation-id",
      kind: "TRANSFER",
    });

    await expect(service.create(input)).resolves.toEqual({
      id: "relation-id",
      kind: "TRANSFER",
    });
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it("rejects malformed input before reaching persistence", async () => {
    await expect(service.create({ kind: "TRANSFER" })).rejects.toEqual(
      new ApplicationError("Revise a relação entre os lançamentos.", 400),
    );
    expect(repository.create).not.toHaveBeenCalled();
  });
});
