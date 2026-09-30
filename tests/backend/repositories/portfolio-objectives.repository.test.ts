import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => database,
}));

import { PortfolioObjectivesRepository } from "@/backend/repositories/portfolio-objectives.repository";
import { ApplicationError } from "@/backend/errors/application-error";

describe("PortfolioObjectivesRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads objectives together with their unique assignments", async () => {
    const objectives = [{ id: "goal-1", name: "Viagem" }];
    const assignments = [{ objectiveId: "goal-1", assetKey: "manual:one" }];
    const objectiveOrderBy = vi.fn().mockResolvedValue(objectives);
    const from = vi
      .fn()
      .mockReturnValueOnce({ orderBy: objectiveOrderBy })
      .mockResolvedValueOnce(assignments);
    database.select.mockReturnValue({ from });

    await expect(new PortfolioObjectivesRepository().list()).resolves.toEqual({
      objectives,
      assignments,
    });
  });

  it("creates a custom goal", async () => {
    const objective = { id: "goal-1", name: "Viagem" };
    const returning = vi.fn().mockResolvedValue([objective]);
    const values = vi.fn().mockReturnValue({ returning });
    database.insert.mockReturnValue({ values });

    await expect(
      new PortfolioObjectivesRepository().create({
        name: "Viagem",
        targetAmount: "1000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toEqual(objective);
    expect(values).toHaveBeenCalledWith({
      name: "Viagem",
      targetAmount: "1000.00",
      monthlyPlannedAmount: null,
      kind: "CUSTOM",
    });
  });

  it("updates only objective details", async () => {
    const objective = { id: "goal-1", name: "Carro" };
    const returning = vi.fn().mockResolvedValue([objective]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockReturnValue({ set });

    await expect(
      new PortfolioObjectivesRepository().update("goal-1", {
        name: "Carro",
        targetAmount: "20000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toEqual(objective);
    expect(set).toHaveBeenCalledWith({
      name: "Carro",
      targetAmount: "20000.00",
      monthlyPlannedAmount: null,
      updatedAt: expect.any(Date),
    });
  });

  it("returns null when an objective update matches no row", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    database.update.mockReturnValue({ set });

    await expect(
      new PortfolioObjectivesRepository().update("missing", {
        name: "Carro",
        targetAmount: "20000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toBeNull();
  });

  it("deletes only the objective row and returns null when absent", async () => {
    const objective = { id: "goal-1", name: "Carro" };
    const returning = vi.fn().mockResolvedValue([objective]);
    const where = vi.fn().mockReturnValue({ returning });
    database.delete.mockReturnValue({ where });

    const repository = new PortfolioObjectivesRepository();
    await expect(repository.delete("goal-1")).resolves.toEqual(objective);
    returning.mockResolvedValueOnce([]);
    await expect(repository.delete("missing")).resolves.toBeNull();
  });

  it("finds an objective or returns null", async () => {
    const limit = vi.fn().mockResolvedValue([{ id: "goal-1" }]);
    const where = vi.fn().mockReturnValue({ limit });
    database.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new PortfolioObjectivesRepository();
    await expect(repository.getObjective("goal-1")).resolves.toEqual({
      id: "goal-1",
    });
    limit.mockResolvedValueOnce([]);
    await expect(repository.getObjective("missing")).resolves.toBeNull();
  });

  it("replaces a goal's assignments and handles an empty assignment list", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteChain = { where: deleteWhere };
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      delete: vi.fn().mockReturnValue(deleteChain),
      insert: vi.fn().mockReturnValue({ values: insertValues }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const repository = new PortfolioObjectivesRepository();

    await repository.replaceAssignments("goal-1", ["asset-a", "asset-b"]);
    expect(insertValues).toHaveBeenCalledWith([
      { objectiveId: "goal-1", assetKey: "asset-a" },
      { objectiveId: "goal-1", assetKey: "asset-b" },
    ]);

    await repository.replaceAssignments("goal-1", []);
    expect(transaction.insert).toHaveBeenCalledTimes(1);
  });

  it("reads and replaces the reserve assignments through the same table", async () => {
    const rows = [
      { objectiveId: "00000000-0000-4000-8000-000000000010", assetKey: "v1:a" },
      { objectiveId: "goal-1", assetKey: "v1:b" },
    ];
    database.select.mockReturnValue({ from: () => Promise.resolve(rows) });
    const repository = new PortfolioObjectivesRepository();
    await expect(repository.listReserveAssignments()).resolves.toEqual([
      "v1:a",
    ]);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: () => ({ where: deleteWhere }),
      insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
    };
    database.transaction.mockImplementation(async (callback) => callback(tx));
    await expect(
      repository.replaceReserveAssignments(["v1:c"]),
    ).resolves.toBeUndefined();
  });

  it("moves an assignment row to its destination without creating a duplicate", async () => {
    const sourceObjectiveId = "00000000-0000-4000-8000-000000000099";
    const destinationObjectiveId = "00000000-0000-4000-8000-000000000010";
    const assetKey = "v1:position";
    const lockRows = vi
      .fn()
      .mockResolvedValue([{ objectiveId: sourceObjectiveId, assetKey }]);
    const transaction = {
      select: () => ({ from: () => ({ where: () => ({ for: lockRows }) }) }),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      insert: vi.fn(),
      delete: vi.fn(),
    };

    await new PortfolioObjectivesRepository().transferAssignments(
      transaction as never,
      [
        {
          assetKey,
          fromObjectiveId: sourceObjectiveId,
          toObjectiveId: destinationObjectiveId,
        },
      ],
    );

    expect(lockRows).toHaveBeenCalledWith("update");
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.insert).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("accepts no transfers and rejects duplicate or same-destination moves", async () => {
    const transaction = {
      select: vi.fn(),
      update: vi.fn(),
    };
    const repository = new PortfolioObjectivesRepository();
    await expect(
      repository.transferAssignments(transaction as never, []),
    ).resolves.toBeUndefined();
    expect(transaction.select).not.toHaveBeenCalled();

    const transfer = {
      assetKey: "v1:position",
      fromObjectiveId: "goal-1",
      toObjectiveId: "goal-2",
    };
    await expect(
      repository.transferAssignments(transaction as never, [
        transfer,
        transfer,
      ]),
    ).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<ApplicationError>);
    await expect(
      repository.transferAssignments(transaction as never, [
        { ...transfer, toObjectiveId: transfer.fromObjectiveId },
      ]),
    ).rejects.toMatchObject({
      statusCode: 400,
    } satisfies Partial<ApplicationError>);
    expect(transaction.select).not.toHaveBeenCalled();
  });

  it("rejects a transfer when the expected source changed and names the current destination", async () => {
    const sourceObjectiveId = "00000000-0000-4000-8000-000000000099";
    const currentObjectiveId = "00000000-0000-4000-8000-000000000088";
    const assetKey = "v1:position";
    const assignmentLock = vi
      .fn()
      .mockResolvedValue([{ objectiveId: currentObjectiveId, assetKey }]);
    const currentName = vi.fn().mockResolvedValue([{ name: "Casa" }]);
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ for: assignmentLock }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: currentName }) }),
      });
    const transaction = {
      select,
      update: vi.fn(),
    };

    await expect(
      new PortfolioObjectivesRepository().transferAssignments(
        transaction as never,
        [
          {
            assetKey,
            fromObjectiveId: sourceObjectiveId,
            toObjectiveId: "00000000-0000-4000-8000-000000000010",
          },
        ],
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Casa"),
    } satisfies Partial<ApplicationError>);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("rejects a transfer whose position became unassigned", async () => {
    const assetKey = "v1:position";
    const assignmentLock = vi.fn().mockResolvedValue([]);
    const select = vi.fn().mockReturnValue({
      from: () => ({ where: () => ({ for: assignmentLock }) }),
    });
    const transaction = { select, update: vi.fn() };

    await expect(
      new PortfolioObjectivesRepository().transferAssignments(
        transaction as never,
        [
          {
            assetKey,
            fromObjectiveId: "00000000-0000-4000-8000-000000000099",
            toObjectiveId: "00000000-0000-4000-8000-000000000010",
          },
        ],
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("sem destino"),
    } satisfies Partial<ApplicationError>);
    expect(select).toHaveBeenCalledTimes(2);
    expect(transaction.update).not.toHaveBeenCalled();
  });

  it("returns null for a missing assignment and a missing assigned objective", async () => {
    const limit = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    database.select.mockReturnValue({
      from: () => ({ where: () => ({ limit }) }),
    });
    const repository = new PortfolioObjectivesRepository();
    await expect(repository.findAssignment("missing")).resolves.toBeNull();

    const assignment = { objectiveId: "deleted-goal", assetKey: "v1:asset" };
    const assignmentLimit = vi.fn().mockResolvedValue([assignment]);
    const objectiveLimit = vi.fn().mockResolvedValue([]);
    database.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: assignmentLimit }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: objectiveLimit }) }),
      });
    await expect(repository.findAssignment("v1:asset")).resolves.toEqual({
      ...assignment,
      objectiveName: null,
    });
  });
});
