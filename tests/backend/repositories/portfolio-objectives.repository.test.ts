import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));
const mutationReplay = vi.hoisted(() => ({
  reserve: vi.fn(),
  complete: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/backend/repositories/mcp-mutation-replays.repository", () => ({
  mcpMutationReplaysRepository: mutationReplay,
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  requireDataOwnerId: () => "user-1",
}));

import { PortfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

describe("PortfolioObjectivesRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists objectives without reading legacy position assignments", async () => {
    const goals = [{ id: "goal-1", name: "Viagem" }];
    const orderBy = vi.fn().mockResolvedValue(goals);
    const where = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });

    await expect(new PortfolioObjectivesRepository().list()).resolves.toEqual({
      objectives: goals,
    });
    expect(database.select).toHaveBeenCalledOnce();
  });

  it("saves an observed balance and its date without assignment fields", async () => {
    const reference = {
      id: "balance-1",
      objectiveId: "goal-1",
      amountCents: "5604248",
      cdiPercentage: null,
    };
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({ for: async () => [{ id: "goal-1" }] }),
        }),
      }),
      insert: vi
        .fn()
        .mockReturnValueOnce({
          values: () => ({ returning: async () => [{ id: "batch-1" }] }),
        })
        .mockReturnValueOnce({
          values: vi.fn((input) => ({
            returning: async () => [{ ...reference, ...input }],
          })),
        }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    const result =
      await new PortfolioObjectivesRepository().saveObservedBalance({
        objectiveId: "goal-1",
        amountCents: "5604248",
        observedOn: "2026-11-14",
      });

    expect(result).toMatchObject({
      objectiveId: "goal-1",
      amountCents: "5604248",
      observedDate: "2026-11-14",
    });
    const values = transaction.insert.mock.results[1]?.value.values;
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        objectiveId: "goal-1",
        amountCents: "5604248",
        cdiPercentage: null,
      }),
    );
    expect(values.mock.calls[0]?.[0]).not.toHaveProperty("assetKeys");
  });

  it("does not save a balance for an objective owned by another user or missing", async () => {
    const insert = vi.fn();
    const transaction = {
      select: () => ({
        from: () => ({ where: () => ({ for: async () => [] }) }),
      }),
      insert,
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioObjectivesRepository().saveObservedBalance({
        objectiveId: "goal-missing",
        amountCents: "1",
        observedOn: "2026-11-14",
      }),
    ).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates an objective directly for a normal request", async () => {
    const objective = { id: "goal-1", name: "Viagem" };
    const returning = vi.fn().mockResolvedValue([objective]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockReturnValue({ values });

    await expect(
      new PortfolioObjectivesRepository().create({
        name: "Viagem",
        purpose: "PERSONAL_GOAL",
        targetAmount: "16000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toBe(objective);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", kind: "CUSTOM" }),
    );
  });

  it("creates objectives with an MCP replay reservation", async () => {
    const objective = { id: "goal-2", name: "Intercâmbio" };
    const returning = vi.fn().mockResolvedValue([objective]);
    const values = vi.fn().mockReturnValue({ returning });
    const transaction = { insert: vi.fn().mockReturnValue({ values }) };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({ replayed: false });

    await expect(
      new PortfolioObjectivesRepository().create({
        name: "Intercâmbio",
        purpose: "PERSONAL_GOAL",
        targetAmount: null,
        monthlyPlannedAmount: null,
        mcpIdempotency: { key: "create-key", payloadHash: "hash" },
      }),
    ).resolves.toBe(objective);
    expect(mutationReplay.reserve).toHaveBeenCalledOnce();
    expect(mutationReplay.complete).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ operation: "create_objective" }),
      objective,
    );
  });

  it("returns a hydrated objective when an MCP create is replayed", async () => {
    const replayedAt = "2026-11-14T00:00:00.000Z";
    const transaction = { insert: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({
      replayed: true,
      result: { id: "goal-3", createdAt: replayedAt, updatedAt: replayedAt },
    });

    const result = await new PortfolioObjectivesRepository().create({
      name: "Curso",
      purpose: "PERSONAL_GOAL",
      targetAmount: null,
      monthlyPlannedAmount: null,
      mcpIdempotency: { key: "create-key", payloadHash: "hash" },
    });

    expect(result.createdAt).toEqual(new Date(replayedAt));
    expect(result.updatedAt).toEqual(new Date(replayedAt));
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("updates and deletes objectives with optional version constraints", async () => {
    const objective = { id: "goal-4", updatedAt: new Date() };
    const returning = vi.fn().mockResolvedValue([objective]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockReturnValue({ set });

    await expect(
      new PortfolioObjectivesRepository().update("goal-4", {
        name: "Viagem",
        purpose: "PERSONAL_GOAL",
        targetAmount: null,
        monthlyPlannedAmount: null,
      }),
    ).resolves.toBe(objective);
    expect(where).toHaveBeenCalledOnce();

    const deleteWhere = vi.fn().mockReturnValue({ returning });
    database.delete.mockReturnValue({ where: deleteWhere });
    await expect(
      new PortfolioObjectivesRepository().delete("goal-4", objective.updatedAt),
    ).resolves.toBe(objective);
    await expect(
      new PortfolioObjectivesRepository().delete("goal-4"),
    ).resolves.toBe(objective);
    expect(deleteWhere).toHaveBeenCalledTimes(2);
  });

  it("returns null when a versioned objective update or delete no longer matches", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    database.update.mockReturnValue({
      set: () => ({ where: () => ({ returning }) }),
    });
    database.delete.mockReturnValue({ where: () => ({ returning }) });

    await expect(
      new PortfolioObjectivesRepository().update(
        "goal-5",
        {
          name: "Viagem",
          purpose: null,
          targetAmount: null,
          monthlyPlannedAmount: null,
        },
        new Date(),
      ),
    ).resolves.toBeNull();
    await expect(
      new PortfolioObjectivesRepository().delete("goal-5", new Date()),
    ).resolves.toBeNull();
  });

  it("supports replay-aware updates and returns a stored replay unchanged", async () => {
    const transaction = { update: vi.fn(), select: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({
      replayed: true,
      result: { id: "goal-6" },
    });

    await expect(
      new PortfolioObjectivesRepository().updateWithMcpReplay(
        "goal-6",
        {
          name: "Viagem",
          purpose: null,
          targetAmount: null,
          monthlyPlannedAmount: null,
        },
        new Date(),
        {
          operation: "update_objective",
          key: "update-key",
          payloadHash: "hash",
        },
      ),
    ).resolves.toEqual({ mcpReplayResult: { id: "goal-6" } });
    expect(transaction.select).not.toHaveBeenCalled();
  });

  it("persists a replay-aware update after checking the current version", async () => {
    const expectedUpdatedAt = new Date("2026-11-14T00:00:00.000Z");
    const objective = {
      id: "goal-7",
      updatedAt: new Date("2026-11-14T00:00:00.000Z"),
    };
    const returning = vi.fn().mockResolvedValue([objective]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const selectRows = [objective];
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({ for: () => ({ limit: async () => selectRows }) }),
        }),
      }),
      update: vi.fn().mockReturnValue({ set }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({ replayed: false });

    await expect(
      new PortfolioObjectivesRepository().updateWithMcpReplay(
        "goal-7",
        {
          name: "Viagem",
          purpose: null,
          targetAmount: null,
          monthlyPlannedAmount: null,
        },
        expectedUpdatedAt,
        {
          operation: "update_objective",
          key: "update-key",
          payloadHash: "hash",
        },
      ),
    ).resolves.toEqual({ mcpUpdated: objective });
    expect(mutationReplay.complete).toHaveBeenCalledOnce();
  });

  it("rejects missing or stale objectives during replay-aware update", async () => {
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({ for: () => ({ limit: async () => [] }) }),
        }),
      }),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({ replayed: false });
    const repository = new PortfolioObjectivesRepository();
    const input = {
      name: "Viagem",
      purpose: null,
      targetAmount: null,
      monthlyPlannedAmount: null,
    };
    const key = {
      operation: "update_objective",
      key: "update-key",
      payloadHash: "hash",
    } as const;
    await expect(
      repository.updateWithMcpReplay("missing", input, new Date(), key),
    ).rejects.toMatchObject({ statusCode: 404 });

    const staleTransaction = {
      ...transaction,
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({
              limit: async () => [{ id: "goal-8", updatedAt: new Date(0) }],
            }),
          }),
        }),
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(staleTransaction),
    );
    await expect(
      repository.updateWithMcpReplay("goal-8", input, new Date(), key),
    ).rejects.toMatchObject({ statusCode: 409 });

    const currentVersion = new Date();
    const absentUpdateTransaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: () => ({
              limit: async () => [{ id: "goal-8", updatedAt: currentVersion }],
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({ where: () => ({ returning: async () => [] }) }),
      }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(absentUpdateTransaction),
    );
    await expect(
      repository.updateWithMcpReplay("goal-8", input, currentVersion, key),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("supports replay-aware objective deletion and guards the reserve", async () => {
    const transaction = { select: vi.fn(), delete: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    mutationReplay.reserve.mockResolvedValue({
      replayed: true,
      result: { id: "goal-9" },
    });
    const repository = new PortfolioObjectivesRepository();
    const idempotency = {
      operation: "delete_objective",
      key: "delete-key",
      payloadHash: "hash",
    } as const;
    await expect(
      repository.deleteWithMcpReplay("goal-9", new Date(), idempotency, {
        deleted: true,
      }),
    ).resolves.toEqual({ mcpReplayResult: { id: "goal-9" } });

    mutationReplay.reserve.mockResolvedValue({ replayed: false });
    await expect(
      repository.deleteWithMcpReplay(
        reserveObjectiveId,
        new Date(),
        idempotency,
        {},
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(transaction.select).not.toHaveBeenCalled();
  });

  it("checks deletion versions and completes the MCP replay after deleting", async () => {
    const updatedAt = new Date("2026-11-14T00:00:00.000Z");
    const key = {
      operation: "delete_objective",
      key: "delete-key",
      payloadHash: "hash",
    } as const;
    const makeTransaction = (
      previous: Array<{ id: string; updatedAt: Date }>,
      deleted: Array<{ id: string }>,
    ) => ({
      select: () => ({
        from: () => ({
          where: () => ({ for: () => ({ limit: async () => previous }) }),
        }),
      }),
      delete: () => ({ where: () => ({ returning: async () => deleted }) }),
    });
    const repository = new PortfolioObjectivesRepository();
    mutationReplay.reserve.mockResolvedValue({ replayed: false });

    database.transaction.mockImplementationOnce(async (callback) =>
      callback(makeTransaction([], [])),
    );
    await expect(
      repository.deleteWithMcpReplay("missing", updatedAt, key, {}),
    ).rejects.toMatchObject({ statusCode: 404 });

    database.transaction.mockImplementationOnce(async (callback) =>
      callback(
        makeTransaction([{ id: "goal-11", updatedAt: new Date(0) }], []),
      ),
    );
    await expect(
      repository.deleteWithMcpReplay("goal-11", updatedAt, key, {}),
    ).rejects.toMatchObject({ statusCode: 409 });

    database.transaction.mockImplementationOnce(async (callback) =>
      callback(makeTransaction([{ id: "goal-11", updatedAt }], [])),
    );
    await expect(
      repository.deleteWithMcpReplay("goal-11", updatedAt, key, {}),
    ).rejects.toMatchObject({ statusCode: 404 });

    const deleted = { id: "goal-11" };
    const transaction = makeTransaction(
      [{ id: "goal-11", updatedAt }],
      [deleted],
    );
    database.transaction.mockImplementationOnce(async (callback) =>
      callback(transaction),
    );
    await expect(
      repository.deleteWithMcpReplay("goal-11", updatedAt, key, {
        deleted: true,
      }),
    ).resolves.toEqual({ mcpDeleted: deleted });
    expect(mutationReplay.complete).toHaveBeenCalledWith(transaction, key, {
      deleted: true,
    });
  });

  it("loads an objective and lists only each user's latest observed balances", async () => {
    const objective = { id: "goal-10" };
    const limit = vi.fn().mockResolvedValue([objective]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    await expect(
      new PortfolioObjectivesRepository().getObjective("goal-10"),
    ).resolves.toBe(objective);

    const rows = [
      {
        objectiveId: "goal-10",
        amountCents: "200",
        observedDate: "2026-11-14",
        createdAt: new Date(2),
        id: "b",
      },
      {
        objectiveId: "goal-10",
        amountCents: "100",
        observedDate: "2026-11-13",
        createdAt: new Date(1),
        id: "a",
      },
      {
        objectiveId: "goal-11",
        amountCents: "300",
        observedDate: "2026-11-12",
        createdAt: new Date(1),
        id: "c",
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const joinedWhere = vi.fn().mockReturnValue({ orderBy });
    const secondJoin = vi.fn().mockReturnValue({ where: joinedWhere });
    const firstJoin = vi.fn().mockReturnValue({ innerJoin: secondJoin });
    database.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ innerJoin: firstJoin }),
    });
    await expect(
      new PortfolioObjectivesRepository().listLatestBalanceReferences(),
    ).resolves.toEqual([
      {
        objectiveId: "goal-10",
        amountCents: "200",
        observedDate: "2026-11-14",
      },
      {
        objectiveId: "goal-11",
        amountCents: "300",
        observedDate: "2026-11-12",
      },
    ]);

    const emptyLimit = vi.fn().mockResolvedValue([]);
    database.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: emptyLimit }) }),
    });
    await expect(
      new PortfolioObjectivesRepository().getObjective("missing"),
    ).resolves.toBeNull();
  });

  it("saves observed balance rows with and without MCP idempotency metadata", async () => {
    const reference = {
      id: "balance-2",
      objectiveId: "goal-12",
      amountCents: "1000",
    };
    const makeTransaction = () => {
      const secondValues = vi.fn((values) => ({
        returning: async () => [{ ...reference, ...values }],
      }));
      const insert = vi
        .fn()
        .mockReturnValueOnce({
          values: () => ({ returning: async () => [{ id: "batch-2" }] }),
        })
        .mockReturnValueOnce({ values: secondValues });
      const transaction = {
        select: () => ({
          from: () => ({
            where: () => ({ for: async () => [{ id: "goal-12" }] }),
          }),
        }),
        insert,
      };
      return { transaction, secondValues };
    };
    const first = makeTransaction();
    database.transaction.mockImplementationOnce(async (callback) =>
      callback(first.transaction),
    );
    await expect(
      new PortfolioObjectivesRepository().saveObservedBalance({
        objectiveId: "goal-12",
        amountCents: "1000",
        observedOn: "2026-11-14",
      }),
    ).resolves.toMatchObject({ observedDate: "2026-11-14" });
    expect(first.secondValues.mock.calls[0]?.[0]).not.toHaveProperty(
      "mcpOperation",
    );

    const second = makeTransaction();
    database.transaction.mockImplementationOnce(async (callback) =>
      callback(second.transaction),
    );
    await new PortfolioObjectivesRepository().saveObservedBalance({
      objectiveId: "goal-12",
      amountCents: "1000",
      observedOn: "2026-11-14",
      mcpIdempotency: {
        operation: "save_observed_balance",
        key: "key",
        payloadHash: "hash",
        replayResult: { ok: true },
      },
    });
    expect(second.secondValues.mock.calls[0]?.[0]).toMatchObject({
      mcpOperation: "save_observed_balance",
      mcpIdempotencyKey: "key",
    });
  });

  it("validates lookup replay hashes and stored replay results", async () => {
    const limitRows = vi.fn();
    const where = vi.fn().mockReturnValue({ limit: limitRows });
    const from = vi.fn().mockReturnValue({ where });
    database.select.mockReturnValue({ from });
    const repository = new PortfolioObjectivesRepository();
    const lookup = {
      operation: "save_observed_balance",
      key: "key",
      payloadHash: "hash",
    };
    limitRows.mockResolvedValue([]);
    await expect(repository.findMcpBalanceReplay(lookup)).resolves.toBeNull();
    limitRows.mockResolvedValue([
      { payloadHash: "different", replayResult: {} },
    ]);
    await expect(repository.findMcpBalanceReplay(lookup)).rejects.toMatchObject(
      { statusCode: 409 },
    );
    limitRows.mockResolvedValue([{ payloadHash: "hash", replayResult: null }]);
    await expect(repository.findMcpBalanceReplay(lookup)).rejects.toMatchObject(
      { statusCode: 409 },
    );
    limitRows.mockResolvedValue([{ payloadHash: "hash", replayResult: [] }]);
    await expect(repository.findMcpBalanceReplay(lookup)).rejects.toMatchObject(
      { statusCode: 409 },
    );
    limitRows.mockResolvedValue([
      { payloadHash: "hash", replayResult: { saved: true } },
    ]);
    await expect(repository.findMcpBalanceReplay(lookup)).resolves.toEqual({
      saved: true,
    });
  });
});
