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

import {
  createAllocationSourceFingerprint,
  PortfolioObjectivesRepository,
} from "@/backend/repositories/portfolio-objectives.repository";
import { ApplicationError } from "@/backend/errors/application-error";

const sqlChunksText = (chunks: unknown[]) =>
  chunks
    .map((chunk) => {
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        const value = (chunk as { value: unknown }).value;
        return Array.isArray(value) ? value.join("") : String(value);
      }
      return "";
    })
    .join("");

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
        purpose: "PERSONAL_GOAL",
        targetAmount: "1000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toEqual(objective);
    expect(values).toHaveBeenCalledWith({
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
      targetAmount: "1000.00",
      monthlyPlannedAmount: null,
      kind: "CUSTOM",
    });
  });

  it("appends a canonical observed balance to a new batch", async () => {
    const objectiveQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([{ id: "goal-1" }]),
    };
    const savedReference = {
      id: "reference-1",
      objectiveId: "goal-1",
      batchId: "batch-1",
      amountCents: "12345",
      cdiPercentage: "100.0000",
    };
    const batchReturning = vi.fn().mockResolvedValue([{ id: "batch-1" }]);
    const referenceReturning = vi.fn().mockResolvedValue([savedReference]);
    const insert = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: batchReturning }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({ returning: referenceReturning }),
      });
    database.transaction.mockImplementation(async (callback) =>
      callback({ select: () => objectiveQuery, insert }),
    );

    await expect(
      new PortfolioObjectivesRepository().saveObservedBalance({
        objectiveId: "goal-1",
        amountCents: "12345",
        observedOn: "2026-10-01",
        cdiPercentage: "100.0000",
      }),
    ).resolves.toEqual({ ...savedReference, observedDate: "2026-10-01" });
    expect(batchReturning).toHaveBeenCalledOnce();
    expect(referenceReturning).toHaveBeenCalledOnce();
  });

  it("does not append a balance when its objective no longer exists", async () => {
    const objectiveQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
    };
    const insert = vi.fn();
    database.transaction.mockImplementation(async (callback) =>
      callback({ select: () => objectiveQuery, insert }),
    );

    await expect(
      new PortfolioObjectivesRepository().saveObservedBalance({
        objectiveId: "missing",
        amountCents: "12345",
        observedOn: "2026-10-01",
        cdiPercentage: null,
      }),
    ).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
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
        purpose: "PERSONAL_GOAL",
        targetAmount: "20000.00",
        monthlyPlannedAmount: null,
      }),
    ).resolves.toEqual(objective);
    expect(set).toHaveBeenCalledWith({
      name: "Carro",
      purpose: "PERSONAL_GOAL",
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
        purpose: "PERSONAL_GOAL",
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

  it("replaces assignment rows and inserts newly selected free positions transactionally", async () => {
    const assetKeys = ["asset-current", "asset-new"];
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const lockRows = vi
      .fn()
      .mockResolvedValue([
        { objectiveId: "goal-1", assetKey: "asset-current" },
      ]);
    const transaction = {
      delete: vi.fn(() => ({ where: deleteWhere })),
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ for: lockRows }) }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
      "goal-1",
      assetKeys,
      [],
    );

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(transaction.delete).toHaveBeenCalledOnce();
    expect(transaction.select).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith([
      { objectiveId: "goal-1", assetKey: "asset-new" },
    ]);
  });

  it("clears assignments inside the transaction when no positions remain", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      delete: vi.fn(() => ({ where: deleteWhere })),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
        "goal-1",
        [],
        [],
      ),
    ).resolves.toBeUndefined();

    expect(transaction.delete).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledOnce();
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("does not reinsert positions already owned by the destination", async () => {
    const lockRows = vi
      .fn()
      .mockResolvedValue([
        { objectiveId: "goal-1", assetKey: "asset-current" },
      ]);
    const transaction = {
      delete: vi.fn(() => ({ where: vi.fn() })),
      select: vi.fn(() => ({
        from: () => ({ where: () => ({ for: lockRows }) }),
      })),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
      "goal-1",
      ["asset-current"],
      [],
    );

    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it.each([
    { rows: [{ name: "Viagem" }], message: "Viagem" },
    { rows: [], message: "outro objetivo" },
  ])(
    "preserves exclusive ownership when a selected position belongs to another objective ($message)",
    async ({ rows, message }) => {
      const ownerId = "goal-owner";
      const lockRows = vi
        .fn()
        .mockResolvedValue([{ objectiveId: ownerId, assetKey: "asset-owned" }]);
      const ownerName = vi.fn().mockResolvedValue(rows);
      const select = vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ for: lockRows }) }),
        })
        .mockReturnValueOnce({
          from: () => ({ where: () => ({ limit: ownerName }) }),
        });
      const transaction = {
        delete: vi.fn(() => ({ where: vi.fn() })),
        select,
        insert: vi.fn(),
      };
      database.transaction.mockImplementation(async (callback) =>
        callback(transaction),
      );

      await expect(
        new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
          "goal-target",
          ["asset-owned"],
          [],
        ),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining(message),
      } satisfies Partial<ApplicationError>);
      expect(transaction.insert).not.toHaveBeenCalled();
    },
  );

  it("reports a concurrent uniqueness conflict using the current owner's name", async () => {
    const assignment = { objectiveId: "goal-current", assetKey: "asset-a" };
    const row = vi.fn().mockResolvedValue([assignment]);
    const name = vi.fn().mockResolvedValue([{ name: "Casa" }]);
    database.transaction.mockRejectedValue({
      code: "23505",
      constraint: "portfolio_objective_positions_assetKey_unique",
    });
    database.select
      .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: row }) }) })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ limit: name }) }),
      });

    await expect(
      new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
        "goal-target",
        ["asset-a"],
        [],
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Casa"),
    } satisfies Partial<ApplicationError>);
  });

  it("reports a concurrent uniqueness conflict when the row is now unassigned", async () => {
    const row = vi.fn().mockResolvedValue([]);
    database.transaction.mockRejectedValue({
      code: "23505",
      constraint: "portfolio_objective_positions_assetKey_unique",
    });
    database.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: row }) }),
    });

    await expect(
      new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
        "goal-target",
        ["asset-a"],
        [],
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("mudou de destino"),
    } satisfies Partial<ApplicationError>);
  });

  it.each([
    new Error("database unavailable"),
    { code: "23505", constraint: "another_unique_constraint" },
  ])(
    "propagates database failures unrelated to asset ownership",
    async (error) => {
      database.transaction.mockRejectedValue(error);

      await expect(
        new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
          "goal-target",
          ["asset-a"],
          [],
        ),
      ).rejects.toBe(error);
      expect(database.select).not.toHaveBeenCalled();
    },
  );

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

  it("replaces the destination selection and transfers rows exclusively in one transaction", async () => {
    const sourceId = "00000000-0000-4000-8000-000000000099";
    const destinationId = "00000000-0000-4000-8000-000000000010";
    const rows = [
      { objectiveId: destinationId, assetKey: "asset-keep" },
      { objectiveId: sourceId, assetKey: "asset-move" },
      { objectiveId: destinationId, assetKey: "asset-remove" },
    ];
    const events: string[] = [];
    const transferKeys = ["asset-move"];
    const selectedKeys = ["asset-move", "asset-keep"];
    let selectCount = 0;
    const transaction = {
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          events.push("replace destination selection");
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (
              rows[index].objectiveId === destinationId &&
              !selectedKeys.includes(rows[index].assetKey)
            ) {
              rows.splice(index, 1);
            }
          }
        }),
      })),
      select: vi.fn(() => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            const selected = rows.filter((row) =>
              (selectCount === 1 ? transferKeys : selectedKeys).includes(
                row.assetKey,
              ),
            );
            return { for: async () => selected };
          },
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: { objectiveId: string }) => ({
          where: vi.fn(async () => {
            events.push("transfer assignment row");
            const assignment = rows.find(
              (row) => row.assetKey === "asset-move",
            );
            if (assignment) assignment.objectiveId = values.objectiveId;
          }),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn() })),
    };
    database.transaction.mockImplementation(async (callback) => {
      events.push("begin transaction");
      const result = await callback(transaction);
      events.push("commit transaction");
      return result;
    });

    await new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
      destinationId,
      selectedKeys,
      [
        {
          assetKey: "asset-move",
          fromObjectiveId: sourceId,
          toObjectiveId: destinationId,
        },
      ],
    );

    expect(events).toEqual([
      "begin transaction",
      "replace destination selection",
      "transfer assignment row",
      "commit transaction",
    ]);
    expect(rows).toEqual([
      { objectiveId: destinationId, assetKey: "asset-keep" },
      { objectiveId: destinationId, assetKey: "asset-move" },
    ]);
    expect(rows.filter((row) => row.assetKey === "asset-move")).toHaveLength(1);
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rolls back selection replacement when a transfer conflicts and returns readable Portuguese", async () => {
    const destinationId = "00000000-0000-4000-8000-000000000010";
    const sourceId = "00000000-0000-4000-8000-000000000099";
    const actualOwnerId = "00000000-0000-4000-8000-000000000088";
    const persistedRows = [
      { objectiveId: destinationId, assetKey: "old-selection" },
      { objectiveId: actualOwnerId, assetKey: "asset-move" },
    ];
    const workingRows = persistedRows.map((row) => ({ ...row }));
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            for: async () =>
              workingRows.filter((row) => row.assetKey === "asset-move"),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ limit: async () => [{ name: "Viagem" }] }),
        }),
      });
    const transaction = {
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          workingRows.splice(
            0,
            workingRows.length,
            ...workingRows.filter((row) => row.objectiveId !== destinationId),
          );
        }),
      })),
      select,
      update: vi.fn(),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) => {
      try {
        return await callback(transaction);
      } catch (error) {
        workingRows.splice(0, workingRows.length, ...persistedRows);
        throw error;
      }
    });

    await expect(
      new PortfolioObjectivesRepository().replaceAssignmentsWithTransfers(
        destinationId,
        ["asset-move"],
        [],
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message:
        "A posição já está vinculada a Viagem. Atualize os objetivos e tente novamente.",
    } satisfies Partial<ApplicationError>);
    expect(workingRows).toEqual(persistedRows);
    expect(transaction.update).not.toHaveBeenCalled();
    expect(transaction.insert).not.toHaveBeenCalled();
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

  it("lists only the latest reference for each objective", async () => {
    const rows = [
      {
        objectiveId: "goal-a",
        amountCents: "500",
        observedDate: "2026-10-01",
        createdAt: new Date("2026-10-02"),
      },
      {
        objectiveId: "goal-a",
        amountCents: "400",
        observedDate: "2026-09-30",
        createdAt: new Date("2026-10-01"),
      },
      {
        objectiveId: "goal-b",
        amountCents: "900",
        observedDate: "2026-10-01",
        createdAt: new Date("2026-10-02"),
      },
    ];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const innerJoin = vi.fn().mockReturnValue({ orderBy });
    database.select.mockReturnValue({ from: () => ({ innerJoin }) });
    await expect(
      new PortfolioObjectivesRepository().listLatestBalanceReferences(),
    ).resolves.toEqual([
      { objectiveId: "goal-a", amountCents: "500", observedDate: "2026-10-01" },
      { objectiveId: "goal-b", amountCents: "900", observedDate: "2026-10-01" },
    ]);
  });

  it("saves references and the complete owner partition in one serializable transaction", async () => {
    const events: string[] = [];
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              for: async () => [{ assetKey: "owned", objectiveId: "goal-a" }],
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            for: async () => [{ id: "goal-a" }, { id: "goal-b" }],
          }),
        }),
      });
    const transaction = {
      select,
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((value) => {
          events.push("insert");
          if (
            !Array.isArray(value) &&
            value &&
            typeof value === "object" &&
            "observedOn" in value
          ) {
            return { returning: async () => [{ id: "batch-1" }] };
          }
          return Promise.resolve();
        }),
      })),
      delete: vi.fn().mockReturnValue({
        where: async () => {
          events.push("delete");
        },
      }),
      update: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({ isolationLevel: "serializable" });
      events.push("begin");
      const result = await callback(transaction);
      events.push("commit");
      return result;
    });
    const repository = new PortfolioObjectivesRepository();
    await repository.saveGlobalAllocation({
      expectedSourceFingerprint: "a".repeat(64),
      observedOn: "2026-10-01",
      expectedOwners: { owned: "goal-a", free: null },
      allocation: { owned: "goal-b", free: "goal-a" },
      references: [
        { objectiveId: "goal-a", amountCents: "10000" },
        { objectiveId: "goal-b", amountCents: "20000" },
      ],
    });
    expect(events[0]).toBe("begin");
    expect(events.at(-1)).toBe("commit");
    expect(transaction.delete).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(4);
  });

  it("rejects an assignment snapshot that omits an allocation key", async () => {
    database.transaction.mockImplementation(async (callback) => callback({}));
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: { a: null },
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "0" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("locks valuation sources and rejects a position set addition before any write", async () => {
    const events: string[] = [];
    const tables = new Map<string, unknown[]>([
      [
        "manual_portfolio_positions",
        [
          {
            id: "manual-position-1",
            assetKey: "manual:new",
            product: "CDB manual",
            assetCode: "MANUAL-1",
            institution: "Banco A",
            quantity: "1.00000000",
            currency: "BRL",
            unitPrice: "10.00",
            totalValue: "10.00",
            valueBasis: "total_value",
            positionDate: "2026-09-30",
            convertedValueBrl: null,
            conversionDate: null,
          },
        ],
      ],
    ]);
    const queryFor = (rows: unknown[]) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: async () => rows,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(rows).then(resolve, reject),
      };
      return query;
    };
    const transaction = {
      execute: vi.fn(async (_statement: unknown) => {
        events.push("lock-sources");
      }),
      select: vi.fn(() => ({
        from: (table: Record<PropertyKey, unknown>) => {
          events.push(`read-${String(table[Symbol.for("drizzle:Name")])}`);
          return queryFor(
            tables.get(String(table[Symbol.for("drizzle:Name")])) ?? [],
          );
        },
      })),
      insert: vi.fn(),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    const expectedSourceFingerprint = createAllocationSourceFingerprint({
      valuationDate: "2026-10-01",
      positions: [],
      assignments: [],
      objectives: [],
    });

    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        observedOn: "2026-10-01",
        expectedSourceFingerprint,
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "1000" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(events[0]).toBe("lock-sources");
    expect(transaction.execute).toHaveBeenCalledOnce();
    const lockStatement = transaction.execute.mock.calls[0][0] as unknown as {
      queryChunks: unknown[];
    };
    expect(sqlChunksText(lockStatement.queryChunks)).toContain(
      "SHARE ROW EXCLUSIVE",
    );
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("revalidates symbol snapshot identity and projects existing assignment rows", async () => {
    const snapshotIdKey = Symbol.for("investlab.positionSnapshotId");
    const cdiInputsKey = Symbol.for("investlab.allocationCdiInputs");
    const position = {
      id: "position-a",
      source: "B3",
      product: "Tesouro Selic",
      institution: "Banco A",
      issuer: null,
      assetCode: "LFT-2029",
      indexer: null,
      regimeType: null,
      issuedAt: null,
      maturityAt: null,
      quantity: "1.00000000",
      availableQuantity: null,
      unavailableQuantity: null,
      unitPrice: null,
      totalValue: "100.00",
      valuationSource: "CURVA",
      mtmUnitPrice: null,
      mtmTotalValue: null,
      curveUnitPrice: null,
      curveTotalValue: null,
      closingUnitPrice: null,
      closingTotalValue: null,
      referenceDate: "2026-09-30",
      estimationBaseDate: "2026-09-30",
    };
    Object.defineProperty(position, snapshotIdKey, { value: "snapshot-a" });
    const expectedSourceFingerprint = createAllocationSourceFingerprint({
      valuationDate: "2026-10-01",
      positions: [position],
      assignments: [{ assetKey: "position-a", objectiveId: "goal-a" }],
      objectives: [{ id: "goal-a", name: "Viagem", kind: "CUSTOM" }],
    });
    const withoutSnapshot = { ...position };
    Object.defineProperty(withoutSnapshot, snapshotIdKey, {
      value: "snapshot-b",
    });
    expect(
      createAllocationSourceFingerprint({
        valuationDate: "2026-10-01",
        positions: [withoutSnapshot],
        assignments: [
          {
            assetKey: "position-a",
            objectiveId: "goal-a",
            id: "assignment-row",
            assignedAt: new Date("2026-09-30T00:00:00Z"),
          },
        ],
        objectives: [{ id: "goal-a", name: "Viagem", kind: "CUSTOM" }],
      }),
    ).not.toBe(expectedSourceFingerprint);
    const cdiInputsWithoutIdentity = {
      source: "B3",
      product: "CDB DI",
      assetCode: "CDB-UNIDENTIFIED",
      indexer: "DI",
    };
    Object.defineProperty(cdiInputsWithoutIdentity, cdiInputsKey, {
      value: {
        assetCode: "CDB-UNIDENTIFIED",
        cdiPercentage: "100.0000",
        rates: [],
      },
    });
    expect(
      createAllocationSourceFingerprint({
        valuationDate: "2026-10-01",
        positions: [cdiInputsWithoutIdentity],
        assignments: [],
        objectives: [],
      }),
    ).toMatch(/^[a-f0-9]{64}$/);

    const rows = new Map<string, unknown[]>([
      [
        "position_snapshots",
        [
          {
            id: "snapshot-a",
            referenceDate: "2026-09-30",
            estimationBaseDate: "2026-09-30",
            createdAt: new Date(),
          },
        ],
      ],
      ["position_items", [{ ...position, snapshotId: "snapshot-a" }]],
      ["manual_portfolio_positions", []],
      [
        "portfolio_objective_positions",
        [
          {
            assetKey: "position-a",
            objectiveId: "goal-a",
            id: "assignment-row",
            assignedAt: new Date("2026-09-30T00:00:00Z"),
          },
        ],
      ],
      [
        "portfolio_objectives",
        [{ id: "goal-a", name: "Viagem", kind: "CUSTOM" }],
      ],
    ]);
    const queryFor = (result: unknown[]) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: async () => result,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: (table: Record<PropertyKey, unknown>) =>
          queryFor(rows.get(String(table[Symbol.for("drizzle:Name")])) ?? []),
      })),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => [{ id: "batch-1" }] }),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        observedOn: "2026-10-01",
        expectedSourceFingerprint,
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "100" }],
      }),
    ).resolves.toEqual({ batchId: "batch-1" });
  });

  it("revalidates multiple imported, manual, CDI, assignment, and objective inputs", async () => {
    const snapshotIdKey = Symbol.for("investlab.positionSnapshotId");
    const cdiInputsKey = Symbol.for("investlab.allocationCdiInputs");
    const cdb = {
      id: "cdb-a",
      source: "B3",
      product: "CDB DI",
      institution: "Banco A",
      issuer: "Banco A S.A.",
      assetCode: "CDB-A",
      indexer: "DI",
      regimeType: "PÓS-FIXADO",
      issuedAt: "2025-01-01",
      maturityAt: "2028-01-01",
      quantity: "1.00000000",
      availableQuantity: "1.00000000",
      unavailableQuantity: "0.00000000",
      unitPrice: "100.00000000",
      totalValue: "100.00",
      valuationSource: "CURVA",
      mtmUnitPrice: null,
      mtmTotalValue: null,
      curveUnitPrice: "100.00000000",
      curveTotalValue: "100.00",
      closingUnitPrice: null,
      closingTotalValue: null,
      referenceDate: "2026-09-30",
      estimationBaseDate: "2026-09-30",
    };
    const other = {
      ...cdb,
      id: "other-b",
      product: "Tesouro Selic",
      assetCode: "LFT-2029",
      indexer: null,
      valuationSource: "CURVA",
      totalValue: "50.00",
    };
    const secondCdb = {
      ...cdb,
      id: "cdb-b",
      assetCode: "CDB-B",
    };
    const noIndexerCdb = {
      ...cdb,
      id: "cdb-no-indexer",
      assetCode: "CDB-NO-INDEXER",
      indexer: null,
    };
    const imported = [cdb, secondCdb, other, noIndexerCdb].map((position) => ({
      ...position,
      [snapshotIdKey]: "snapshot-current",
    }));
    [imported[0], imported[1]].forEach((position, index) => {
      Object.defineProperty(position, cdiInputsKey, {
        value: {
          assetCode: index === 0 ? "CDB-A" : "CDB-B",
          cdiPercentage: "110.0000",
          rates: [
            {
              rateDate: "2026-10-01",
              annualRate: "14.900000",
              fetchedAt: new Date("2026-10-01T12:00:00Z"),
            },
            {
              rateDate: "2026-10-02",
              annualRate: "15.000000",
              fetchedAt: new Date("2026-10-02T12:00:00Z"),
            },
          ],
        },
      });
    });
    const manualRecords = [
      {
        id: "manual-brl",
        assetKey: "manual-brl",
        product: "Renda fixa manual",
        assetCode: null,
        institution: "Banco B",
        quantity: "1.00000000",
        currency: "BRL",
        unitPrice: null,
        totalValue: "30.00",
        valueBasis: "total_value",
        positionDate: "2026-09-30",
        convertedValueBrl: null,
        conversionDate: null,
      },
      {
        id: "manual-fx",
        assetKey: "manual-fx",
        product: "ETF internacional",
        assetCode: "ETF-X",
        institution: "Broker",
        quantity: "1.00000000",
        currency: "USD",
        unitPrice: "20.00",
        totalValue: "20.00",
        valueBasis: "total_value",
        positionDate: "2026-09-30",
        convertedValueBrl: "105.00",
        conversionDate: "2026-09-30",
      },
    ];
    const assignments = [
      { assetKey: "manual-brl", objectiveId: "goal-a" },
      { assetKey: "manual-fx", objectiveId: "goal-b" },
    ];
    const objectives = [
      { id: "goal-a", name: "Reserva", kind: "RESERVE" },
      { id: "goal-b", name: "Viagem", kind: "CUSTOM" },
    ];
    const previewManual = manualRecords.map((position) => ({
      ...position,
      source: "MANUAL",
      reportedTotalValue: position.totalValue,
      totalValue:
        position.currency === "BRL"
          ? position.totalValue
          : position.convertedValueBrl,
      referenceDate: position.positionDate,
    }));
    const expectedSourceFingerprint = createAllocationSourceFingerprint({
      valuationDate: "2026-10-02",
      positions: [...imported, ...previewManual],
      assignments: [
        ...assignments.map((assignment) => ({
          ...assignment,
          id: "ignored-id",
          assignedAt: new Date("2026-09-30T00:00:00Z"),
        })),
      ],
      objectives,
    });
    const rows = new Map<string, unknown[]>([
      [
        "position_snapshots",
        [
          {
            id: "snapshot-current",
            referenceDate: "2026-09-30",
            estimationBaseDate: "2026-09-30",
            createdAt: new Date("2026-09-30T12:00:00Z"),
          },
        ],
      ],
      [
        "position_items",
        [cdb, secondCdb, other, noIndexerCdb].map((position) => ({
          ...position,
          snapshotId: "snapshot-current",
        })),
      ],
      ["manual_portfolio_positions", manualRecords],
      [
        "cdb_rate_configurations",
        ["CDB-A", "CDB-B"].map((assetCode) => ({
          assetCode,
          cdiPercentage: "110.0000",
        })),
      ],
      [
        "cdi_daily_rates",
        [
          {
            rateDate: "2026-10-01",
            annualRate: "14.900000",
            fetchedAt: new Date("2026-10-01T12:00:00Z"),
          },
          {
            rateDate: "2026-10-02",
            annualRate: "15.000000",
            fetchedAt: new Date("2026-10-02T12:00:00Z"),
          },
        ],
      ],
      [
        "portfolio_objective_positions",
        assignments.map((assignment, index) => ({
          ...assignment,
          id: `assignment-${index}`,
          assignedAt: new Date("2026-09-30T00:00:00Z"),
        })),
      ],
      ["portfolio_objectives", objectives],
    ]);
    const queryFor = (result: unknown[]) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: async () => result,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: (table: Record<PropertyKey, unknown>) =>
          queryFor(rows.get(String(table[Symbol.for("drizzle:Name")])) ?? []),
      })),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => [{ id: "batch-cdi" }] }),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        observedOn: "2026-10-02",
        expectedSourceFingerprint,
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "10000" }],
      }),
    ).resolves.toEqual({ batchId: "batch-cdi" });
  });

  it("revalidates a CDI position without a trusted base, configuration, or rate set", async () => {
    const snapshotKey = Symbol.for("investlab.positionSnapshotId");
    const cdiInputsKey = Symbol.for("investlab.allocationCdiInputs");
    const item = {
      id: "cdb-no-base",
      source: "B3",
      product: "CDB DI",
      assetCode: "CDB-NO-BASE",
      indexer: "DI",
      totalValue: "100.00",
      valuationSource: "CURVA",
      referenceDate: "2026-09-30",
      estimationBaseDate: null,
    };
    const previewPosition = { ...item };
    Object.defineProperty(previewPosition, snapshotKey, {
      value: "snapshot-no-base",
    });
    Object.defineProperty(previewPosition, cdiInputsKey, {
      value: {
        assetCode: "CDB-NO-BASE",
        cdiPercentage: null,
        rates: [],
      },
    });
    const objectives = [{ id: "goal-a", name: "Reserva", kind: "RESERVE" }];
    const expectedSourceFingerprint = createAllocationSourceFingerprint({
      valuationDate: "2026-10-01",
      positions: [previewPosition],
      assignments: [],
      objectives,
    });
    const rows = new Map<string, unknown[]>([
      [
        "position_snapshots",
        [
          {
            id: "snapshot-no-base",
            referenceDate: "2026-09-30",
            estimationBaseDate: null,
          },
        ],
      ],
      ["position_items", [{ ...item, snapshotId: "snapshot-no-base" }]],
      ["manual_portfolio_positions", []],
      ["cdb_rate_configurations", []],
      ["portfolio_objective_positions", []],
      ["portfolio_objectives", objectives],
    ]);
    const queryFor = (result: unknown[]) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: async () => result,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve(result).then(resolve, reject),
      };
      return query;
    };
    const transaction = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: (table: Record<PropertyKey, unknown>) =>
          queryFor(rows.get(String(table[Symbol.for("drizzle:Name")])) ?? []),
      })),
      insert: vi.fn(() => ({
        values: () => ({ returning: async () => [{ id: "batch-no-base" }] }),
      })),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        observedOn: "2026-10-01",
        expectedSourceFingerprint,
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "10000" }],
      }),
    ).resolves.toEqual({ batchId: "batch-no-base" });
  });

  it("rejects a concurrent owner change before writing the reference batch", async () => {
    const select = vi.fn().mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            for: async () => [{ assetKey: "asset-a", objectiveId: "goal-b" }],
          }),
        }),
      }),
    });
    const transaction = { select, insert: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: { "asset-a": "goal-a" },
        allocation: { "asset-a": "goal-c" },
        references: [{ objectiveId: "goal-c", amountCents: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("rejects references to a destination that was deleted before confirmation", async () => {
    const select = vi.fn().mockReturnValueOnce({
      from: () => ({
        where: () => ({ for: async () => [] }),
      }),
    });
    const transaction = { select, insert: vi.fn() };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "deleted-goal", amountCents: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("lets a failed assignment write roll back the references in its transaction", async () => {
    const events: string[] = [];
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ orderBy: () => ({ for: async () => [] }) }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ for: async () => [{ id: "goal-a" }] }),
        }),
      });
    const transaction = {
      select,
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((value) => {
          if (
            !Array.isArray(value) &&
            value &&
            typeof value === "object" &&
            "observedOn" in value
          ) {
            return { returning: async () => [{ id: "batch-1" }] };
          }
          if (Array.isArray(value) && "amountCents" in value[0])
            return Promise.resolve();
          throw new Error("simulated unique conflict");
        }),
      })),
    };
    database.transaction.mockImplementation(async (callback) => {
      events.push("begin");
      try {
        const result = await callback(transaction);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    });
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: { "asset-a": null },
        allocation: { "asset-a": "goal-a" },
        references: [{ objectiveId: "goal-a", amountCents: "1" }],
      }),
    ).rejects.toThrow("simulated unique conflict");
    expect(events).toEqual(["begin", "rollback"]);
  });

  it("converts serialization failures into a retryable conflict", async () => {
    database.transaction.mockRejectedValue({ code: "40001" });
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "1" }],
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("converts a PostgreSQL deadlock into a retryable conflict", async () => {
    database.transaction.mockRejectedValue({ code: "40P01" });
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("skips unchanged assignments and permits an empty optional reference list", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              for: async () => [
                { assetKey: "asset-a", objectiveId: "goal-a" },
                { assetKey: "asset-b", objectiveId: "goal-a" },
              ],
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({ for: async () => [{ id: "goal-a" }] }),
        }),
      });
    const returning = vi.fn().mockResolvedValue([{ id: "batch-1" }]);
    const values = vi.fn().mockReturnValue({ returning });
    const transaction = {
      select,
      insert: vi.fn().mockReturnValue({ values }),
      delete: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    database.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );
    await new PortfolioObjectivesRepository().saveGlobalAllocation({
      expectedSourceFingerprint: "a".repeat(64),
      observedOn: "2026-10-01",
      expectedOwners: { "asset-a": "goal-a", "asset-b": "goal-a" },
      allocation: { "asset-a": "goal-a", "asset-b": null },
      references: [],
    });
    expect(transaction.insert).toHaveBeenCalledOnce();
    expect(transaction.delete).toHaveBeenCalledOnce();
  });

  it("maps the exclusive asset constraint to a conflict", async () => {
    database.transaction.mockRejectedValue({
      code: "23505",
      constraint: "portfolio_objective_positions_assetKey_unique",
    });
    await expect(
      new PortfolioObjectivesRepository().saveGlobalAllocation({
        expectedSourceFingerprint: "a".repeat(64),
        observedOn: "2026-10-01",
        expectedOwners: {},
        allocation: {},
        references: [{ objectiveId: "goal-a", amountCents: "1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
