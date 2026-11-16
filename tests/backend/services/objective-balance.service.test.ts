import { describe, expect, it, vi } from "vitest";
import { ObjectiveBalanceService } from "@/backend/services/objective-balance.service";
import type { PortfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";

const objectiveId = "00000000-0000-4000-8000-000000000001";
const input = {
  objectiveId,
  amount: "56042.48",
  observedOn: "2026-11-14",
};
const saved = {
  objectiveId,
  amountCents: "5604248",
  observedDate: "2026-11-14",
};

function createRepository() {
  return {
    saveObservedBalance: vi.fn().mockResolvedValue(saved),
    findMcpBalanceReplay: vi.fn().mockResolvedValue(null),
  };
}

const serviceFor = (repository: ReturnType<typeof createRepository>) =>
  new ObjectiveBalanceService(
    repository as unknown as PortfolioObjectivesRepository,
  );

describe("ObjectiveBalanceService", () => {
  it("saves only the objective balance and observed date", async () => {
    const repository = createRepository();
    const service = serviceFor(repository);

    await expect(service.save(input)).resolves.toEqual(saved);
    expect(repository.saveObservedBalance).toHaveBeenCalledWith({
      objectiveId,
      amountCents: "5604248",
      observedOn: "2026-11-14",
      mcpIdempotency: undefined,
    });
  });

  it("rejects invalid amounts, identifiers, or future dates before writing", async () => {
    const repository = createRepository();
    const service = serviceFor(repository);

    await expect(
      service.save({ ...input, amount: "-1" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.save({ ...input, objectiveId: "invalid" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      service.save({ ...input, observedOn: "2999-01-01" }),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repository.saveObservedBalance).not.toHaveBeenCalled();
  });

  it("reports a missing objective from the repository", async () => {
    const repository = createRepository();
    repository.saveObservedBalance.mockResolvedValue(null);

    await expect(serviceFor(repository).save(input)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("returns an idempotent replay without writing twice", async () => {
    const repository = createRepository();
    repository.findMcpBalanceReplay.mockResolvedValue(saved);

    await expect(
      serviceFor(repository).save(input, "r1", {
        idempotencyKey: "balance-key-1",
      }),
    ).resolves.toEqual(saved);
    expect(repository.findMcpBalanceReplay).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "save_observed_balance" }),
    );
    expect(repository.saveObservedBalance).not.toHaveBeenCalled();
  });

  it("persists the idempotency key with a hash of only amount and date", async () => {
    const repository = createRepository();
    repository.findMcpBalanceReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved);

    await expect(
      serviceFor(repository).save(input, "r2", {
        idempotencyKey: "balance-key-2",
      }),
    ).resolves.toEqual(saved);
    expect(repository.saveObservedBalance).toHaveBeenCalledWith(
      expect.objectContaining({
        objectiveId,
        amountCents: "5604248",
        observedOn: "2026-11-14",
        mcpIdempotency: expect.objectContaining({
          operation: "save_observed_balance",
          key: "balance-key-2",
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
  });

  it("rejects an invalid idempotency key", async () => {
    const repository = createRepository();
    await expect(
      serviceFor(repository).save(input, undefined, {
        idempotencyKey: "short",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveObservedBalance).not.toHaveBeenCalled();
  });

  it("returns the submitted data when a new MCP write has no replay record", async () => {
    const repository = createRepository();
    repository.findMcpBalanceReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      serviceFor(repository).save(input, "request", {
        idempotencyKey: "balance-key-3",
      }),
    ).resolves.toEqual(saved);
    expect(repository.findMcpBalanceReplay).toHaveBeenCalledTimes(2);
  });

  it("returns a replay after a concurrent idempotent write", async () => {
    const repository = createRepository();
    const conflictReplay = { ...saved, source: "replay" };
    repository.findMcpBalanceReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conflictReplay);
    repository.saveObservedBalance.mockRejectedValue({ code: "23505" });

    await expect(
      serviceFor(repository).save(input, "request", {
        idempotencyKey: "balance-key-4",
      }),
    ).resolves.toEqual(conflictReplay);
  });

  it("rethrows write conflicts that do not have an MCP replay", async () => {
    const repository = createRepository();
    const conflict = Object.assign(new Error("conflict"), { statusCode: 409 });
    repository.findMcpBalanceReplay.mockResolvedValue(null);
    repository.saveObservedBalance.mockRejectedValue(conflict);

    await expect(
      serviceFor(repository).save(input, "request", {
        idempotencyKey: "balance-key-5",
      }),
    ).rejects.toBe(conflict);
  });

  it("rethrows persistence failures without idempotency and reports an absent objective", async () => {
    const repository = createRepository();
    const failure = new Error("database unavailable");
    repository.saveObservedBalance.mockRejectedValueOnce(failure);
    await expect(serviceFor(repository).save(input)).rejects.toBe(failure);

    repository.saveObservedBalance.mockResolvedValueOnce(null);
    await expect(serviceFor(repository).save(input)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("rejects an idempotency key above the allowed size", async () => {
    const repository = createRepository();
    await expect(
      serviceFor(repository).save(input, undefined, {
        idempotencyKey: "x".repeat(129),
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.saveObservedBalance).not.toHaveBeenCalled();
  });
});
