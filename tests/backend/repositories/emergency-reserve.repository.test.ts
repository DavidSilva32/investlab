import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
}));
const objectiveAssignments = vi.hoisted(() => ({
  listReserveAssignments: vi.fn(),
  transferAssignments: vi.fn(),
  findAssignment: vi.fn(),
}));
vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => client,
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: objectiveAssignments,
}));

import { EmergencyReserveRepository } from "@/backend/repositories/emergency-reserve.repository";
import { ApplicationError } from "@/backend/errors/application-error";

describe("EmergencyReserveRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectiveAssignments.listReserveAssignments.mockResolvedValue([]);
    objectiveAssignments.transferAssignments.mockResolvedValue(undefined);
  });

  it("returns the singleton settings row or null when it is not configured", async () => {
    const limit = vi.fn().mockResolvedValue([{ monthlyExpenses: "1200.00" }]);
    const where = vi.fn().mockReturnValue({ limit });
    client.select.mockReturnValue({ from: () => ({ where }) });
    const repository = new EmergencyReserveRepository();

    await expect(repository.getSettings()).resolves.toEqual({
      monthlyExpenses: "1200.00",
      targetMonths: null,
      selectedAssetKeys: [],
    });
    expect(limit).toHaveBeenCalledWith(1);

    limit.mockResolvedValueOnce([]);
    await expect(repository.getSettings()).resolves.toBeNull();

    limit.mockResolvedValueOnce([]);
    objectiveAssignments.listReserveAssignments.mockResolvedValueOnce([
      "v1:legacy-position",
    ]);
    await expect(repository.getSettings()).resolves.toEqual({
      monthlyExpenses: null,
      targetMonths: null,
      selectedAssetKeys: ["v1:legacy-position"],
    });
  });

  it("upserts the singleton settings and refreshes its update timestamp", async () => {
    const saved = {
      id: "default",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    };
    const returning = vi.fn().mockResolvedValue([saved]);
    const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
    const settingsValues = vi.fn().mockReturnValue({ onConflictDoUpdate });
    client.insert.mockReturnValue({ values: settingsValues });

    await expect(
      new EmergencyReserveRepository().saveSettings({
        monthlyExpenses: "1200.00",
        targetMonths: 6,
      }),
    ).resolves.toEqual([saved]);
    expect(settingsValues).toHaveBeenCalledWith({
      id: "default",
      monthlyExpenses: "1200.00",
      targetMonths: 6,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          monthlyExpenses: "1200.00",
          targetMonths: 6,
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(client.transaction).not.toHaveBeenCalled();
  });

  it("saves assignments without touching emergency reserve settings", async () => {
    const assignmentError = new Error("duplicate assignment");
    const transaction = {
      insert: vi.fn(() => ({ values: () => Promise.reject(assignmentError) })),
      delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      select: () => ({
        from: () => ({
          where: () => ({ for: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new EmergencyReserveRepository()
      .saveAssignments({
        selectedAssetKeys: ["v1:key"],
      })
      .catch((error) => expect(error).toBe(assignmentError));
    expect(client.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.insert).toHaveBeenCalledTimes(1);
  });

  it("deletes old reserve assignments when the new selection is empty", async () => {
    const transaction = {
      insert: vi.fn(),
      delete: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new EmergencyReserveRepository().saveAssignments({
      selectedAssetKeys: [],
    });

    expect(transaction.delete).toHaveBeenCalledTimes(1);
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it.each([
    {
      transfer: {
        assetKey: "v1:not-selected",
        fromObjectiveId: "00000000-0000-4000-8000-000000000099",
        toObjectiveId: "00000000-0000-4000-8000-000000000010",
      },
      selectedAssetKeys: ["v1:selected"],
    },
    {
      transfer: {
        assetKey: "v1:selected",
        fromObjectiveId: "00000000-0000-4000-8000-000000000099",
        toObjectiveId: "00000000-0000-4000-8000-000000000099",
      },
      selectedAssetKeys: ["v1:selected"],
    },
  ])(
    "rejects an invalid reserve transfer before starting a transaction",
    async ({ transfer, selectedAssetKeys }) => {
      await expect(
        new EmergencyReserveRepository().saveAssignments({
          selectedAssetKeys,
          transfers: [transfer],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      } satisfies Partial<ApplicationError>);
      expect(client.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { objective: { name: "Viagem" }, expectedMessage: "Viagem" },
    { objective: undefined, expectedMessage: "outro objetivo" },
  ])(
    "names a transaction-time assignment conflict when possible",
    async ({ objective, expectedMessage }) => {
      const goalId = "00000000-0000-4000-8000-000000000099";
      const assignment = { assetKey: "v1:position", objectiveId: goalId };
      const transaction = {
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
        delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({ for: vi.fn().mockResolvedValue([assignment]) }),
            }),
          })
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({
                limit: vi.fn().mockResolvedValue(objective ? [objective] : []),
              }),
            }),
          }),
      };
      client.transaction.mockImplementation(async (callback) =>
        callback(transaction),
      );

      await expect(
        new EmergencyReserveRepository().saveAssignments({
          selectedAssetKeys: [assignment.assetKey],
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining(expectedMessage),
      } satisfies Partial<ApplicationError>);
    },
  );

  it("saves reserve assignments and generic transfers in the same transaction", async () => {
    const key = "v1:position";
    const transfer = {
      assetKey: key,
      fromObjectiveId: "00000000-0000-4000-8000-000000000099",
      toObjectiveId: "00000000-0000-4000-8000-000000000010",
    };
    const transaction = {
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      select: () => ({
        from: () => ({
          where: () => ({
            for: vi.fn().mockResolvedValue([
              {
                assetKey: key,
                objectiveId: "00000000-0000-4000-8000-000000000010",
              },
            ]),
          }),
        }),
      }),
    };
    client.transaction.mockImplementation(async (callback) =>
      callback(transaction),
    );

    await new EmergencyReserveRepository().saveAssignments({
      selectedAssetKeys: [key],
      transfers: [transfer],
    });

    expect(objectiveAssignments.transferAssignments).toHaveBeenCalledWith(
      transaction,
      [transfer],
    );
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("preserves the settings when a transfer source changed", async () => {
    const transfer = {
      assetKey: "v1:position",
      fromObjectiveId: "00000000-0000-4000-8000-000000000099",
      toObjectiveId: "00000000-0000-4000-8000-000000000010",
    };
    const persisted = {
      settings: { monthlyExpenses: "500.00", targetMonths: 3 },
      assignments: new Map([[transfer.assetKey, transfer.fromObjectiveId]]),
    };
    const stagedStates: (typeof persisted)[] = [];
    client.transaction.mockImplementation(async (callback) => {
      const staged = {
        settings: { ...persisted.settings },
        assignments: new Map(persisted.assignments),
      };
      stagedStates.push(staged);
      const transaction = {
        insert: vi.fn(() => ({
          values: (values: typeof staged.settings & { id: string }) => ({
            onConflictDoUpdate: ({ set }: { set: typeof staged.settings }) => ({
              returning: async () => {
                staged.settings = { ...values, ...set };
                return [staged.settings];
              },
            }),
          }),
        })),
        delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      };
      const result = await callback(transaction);
      persisted.settings = staged.settings;
      persisted.assignments = staged.assignments;
      return result;
    });
    const staleOrigin = new ApplicationError(
      "A posição agora está em Casa.",
      409,
    );
    objectiveAssignments.transferAssignments.mockImplementationOnce(
      async () => {
        stagedStates[0].assignments.set(
          transfer.assetKey,
          transfer.toObjectiveId,
        );
        throw staleOrigin;
      },
    );

    await expect(
      new EmergencyReserveRepository().saveAssignments({
        selectedAssetKeys: [transfer.assetKey],
        transfers: [transfer],
      }),
    ).rejects.toBe(staleOrigin);
    expect(stagedStates[0].settings.monthlyExpenses).toBe("500.00");
    expect(stagedStates[0].assignments.get(transfer.assetKey)).toBe(
      transfer.toObjectiveId,
    );
    expect(persisted.settings).toEqual({
      monthlyExpenses: "500.00",
      targetMonths: 3,
    });
    expect(persisted.assignments).toEqual(
      new Map([[transfer.assetKey, transfer.fromObjectiveId]]),
    );
  });

  it.each([
    {
      objectiveId: "goal-trip",
      objectiveName: "Viagem",
      expectedMessage: "Viagem",
    },
    {
      objectiveId: "00000000-0000-4000-8000-000000000010",
      objectiveName: "Reserva",
      expectedMessage: "Reserva",
    },
    {
      objectiveId: "00000000-0000-4000-8000-000000000099",
      objectiveName: null,
      expectedMessage: "outro objetivo durante esta atualização",
    },
    {
      assignment: null,
      expectedMessage: "não está mais atribuída",
    },
  ])(
    "reports a named concurrent assignment to $objectiveName as 409",
    async ({ objectiveId, objectiveName, assignment, expectedMessage }) => {
      const uniqueConflict = Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint: "portfolio_objective_positions_assetKey_unique",
      });
      const transaction = {
        insert: vi.fn().mockReturnValueOnce({
          values: () => Promise.reject(uniqueConflict),
        }),
        delete: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
        select: () => ({
          from: () => ({
            where: () => ({ for: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      };
      client.transaction.mockImplementation(async (callback) =>
        callback(transaction),
      );
      objectiveAssignments.findAssignment.mockResolvedValue(
        assignment === null ? null : { objectiveId, objectiveName },
      );

      const error = await new EmergencyReserveRepository()
        .saveAssignments({
          selectedAssetKeys: ["v1:position"],
        })
        .then(
          () => null,
          (cause: unknown) => cause as Error & { statusCode: number },
        );
      if (!error) throw new Error("Expected a concurrent assignment conflict");
      expect(error).toMatchObject({
        statusCode: 409,
        message: expect.stringContaining(expectedMessage),
      });
      if (objectiveName === "Reserva") {
        expect(error.message).not.toContain("outro destino");
        expect(error.message).not.toContain("outro objetivo");
      }
      expect(objectiveAssignments.findAssignment).toHaveBeenCalledWith(
        "v1:position",
      );
      expect(client.transaction).toHaveBeenCalledTimes(1);
      expect(transaction.insert).toHaveBeenCalledTimes(1);
    },
  );
});
