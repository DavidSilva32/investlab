import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  getObjective: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getSettings: vi.fn(),
  listRecurrences: vi.fn(),
  listLatestBalanceReferences: vi.fn(),
  findReplay: vi.fn(),
}));
vi.mock("@/backend/repositories/portfolio-objectives.repository", () => ({
  portfolioObjectivesRepository: {
    list: mocks.list,
    create: mocks.create,
    getObjective: mocks.getObjective,
    update: mocks.update,
    updateWithMcpReplay: mocks.update,
    delete: mocks.delete,
    deleteWithMcpReplay: mocks.delete,
    listLatestBalanceReferences: mocks.listLatestBalanceReferences,
  },
}));
vi.mock("@/backend/repositories/emergency-reserve.repository", () => ({
  emergencyReserveRepository: { getSettings: mocks.getSettings },
}));
vi.mock("@/backend/repositories/financial-recurrences.repository", () => ({
  financialRecurrencesRepository: { listRecurrences: mocks.listRecurrences },
}));
vi.mock("@/backend/repositories/mcp-mutation-replays.repository", () => ({
  mcpMutationReplaysRepository: { find: mocks.findReplay },
}));

import { ApplicationError } from "@/backend/errors/application-error";
import { PortfolioObjectivesService } from "@/backend/services/portfolio-objectives.service";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const timestamp = new Date("2026-11-14T00:00:00.000Z");
const goal = (overrides: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  kind: "CUSTOM",
  purpose: "PERSONAL_GOAL",
  name: "Viagem",
  targetAmount: "16000.00",
  monthlyPlannedAmount: "2000.00",
  updatedAt: timestamp,
  ...overrides,
});

describe("PortfolioObjectivesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ objectives: [goal()] });
    mocks.getSettings.mockResolvedValue(null);
    mocks.listRecurrences.mockResolvedValue([]);
    mocks.listLatestBalanceReferences.mockResolvedValue([]);
    mocks.findReplay.mockResolvedValue(null);
  });

  it("uses the latest observed amount for goal progress and never reads assignments", async () => {
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: "00000000-0000-4000-8000-000000000001",
        amountCents: "1230456",
        observedDate: "2026-11-14",
      },
    ]);

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result).toEqual({
      objectives: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          updatedAt: timestamp.toISOString(),
          kind: "CUSTOM",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 16000,
          monthlyPlannedAmount: 2000,
          currentValue: 12304.56,
          remainingAmount: expect.closeTo(3695.44, 2),
          progressPercent: 76.9035,
          balanceTracking: {
            observedAmountCents: "1230456",
            observedOn: "2026-11-14",
          },
        },
      ],
    });
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("leaves current value, remaining amount, and progress empty until a balance is recorded", async () => {
    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      currentValue: null,
      remainingAmount: null,
      progressPercent: null,
      balanceTracking: null,
    });
    expect(result.objectives[0]).not.toHaveProperty("knownValue");
    expect(result).not.toHaveProperty("positions");
  });

  it("treats an invalid legacy planned amount as zero without inventing progress", async () => {
    mocks.list.mockResolvedValue({
      objectives: [goal({ monthlyPlannedAmount: "invalid-amount" })],
    });

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      monthlyPlannedAmount: 0,
      currentValue: null,
      progressPercent: null,
    });
  });

  it("calculates the reserve target from its settings while keeping the observed amount primary", async () => {
    mocks.list.mockResolvedValue({
      objectives: [
        goal({
          id: reserveObjectiveId,
          kind: "RESERVE",
          name: "Reserva",
          targetAmount: null,
          monthlyPlannedAmount: null,
        }),
      ],
    });
    mocks.getSettings.mockResolvedValue({
      monthlyExpenses: "4650.00",
      targetMonths: 12,
    });
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: reserveObjectiveId,
        amountCents: "5604248",
        observedDate: "2026-11-14",
      },
    ]);

    const result = await new PortfolioObjectivesService().getOverview();

    expect(result.objectives[0]).toMatchObject({
      currentValue: 56042.48,
      targetAmount: 55800,
      remainingAmount: 0,
      progressPercent: 100,
    });
  });

  it("creates a normalized objective", async () => {
    mocks.create.mockResolvedValue(goal());

    await new PortfolioObjectivesService().create({
      name: " Viagem ",
      purpose: "PERSONAL_GOAL",
      targetAmount: 16000,
      monthlyPlannedAmount: 2000,
    });

    expect(mocks.create).toHaveBeenCalledWith({
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
      targetAmount: "16000.00",
      monthlyPlannedAmount: "2000.00",
    });
  });

  it("rejects invalid objective details and invalid idempotency keys", async () => {
    const service = new PortfolioObjectivesService();
    await expect(
      service.create({ name: "", purpose: "PERSONAL_GOAL" }),
    ).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.create(
        { name: "Viagem", purpose: "PERSONAL_GOAL" },
        { idempotencyKey: "short" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates objectives with nullable fields and an MCP payload hash", async () => {
    mocks.create.mockResolvedValue(goal({ targetAmount: null }));
    await new PortfolioObjectivesService().create(
      { name: "  Curso  ", purpose: "LONG_TERM_INVESTMENT" },
      { idempotencyKey: "create-key-123" },
    );

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Curso",
        purpose: "LONG_TERM_INVESTMENT",
        targetAmount: null,
        monthlyPlannedAmount: null,
        mcpIdempotency: {
          key: "create-key-123",
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
      }),
    );
  });

  it("calculates absent reserve targets and caps observed progress at the goal", async () => {
    mocks.list.mockResolvedValue({
      objectives: [
        goal({ targetAmount: null, monthlyPlannedAmount: null, purpose: null }),
        goal({ id: "goal-above", targetAmount: "100.00" }),
      ],
    });
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: "goal-above",
        amountCents: "15000",
        observedDate: "2026-11-14",
      },
    ]);

    const overview = await new PortfolioObjectivesService().getOverview();

    expect(overview.objectives[0]).toMatchObject({
      purpose: null,
      targetAmount: null,
      monthlyPlannedAmount: null,
      currentValue: null,
      progressPercent: null,
    });
    expect(overview.objectives[1]).toMatchObject({
      currentValue: 150,
      remainingAmount: 0,
      progressPercent: 100,
    });
  });

  it("uses recurrence totals as the reserve target when settings are absent", async () => {
    mocks.list.mockResolvedValue({
      objectives: [
        goal({ id: reserveObjectiveId, kind: "RESERVE", targetAmount: null }),
      ],
    });
    mocks.listRecurrences.mockResolvedValue([
      {
        description: "Aluguel",
        amount: "1000.00",
        frequency: "MONTHLY",
        kind: "EXPENSE",
        essential: true,
        active: true,
      },
    ]);
    mocks.listLatestBalanceReferences.mockResolvedValue([
      {
        objectiveId: reserveObjectiveId,
        amountCents: "300000",
        observedDate: "2026-11-14",
      },
    ]);

    const overview = await new PortfolioObjectivesService().getOverview();
    expect(overview.objectives[0]).toMatchObject({
      targetAmount: 6000,
      currentValue: 3000,
      remainingAmount: 3000,
      progressPercent: 50,
    });
  });

  it("updates with idempotency replay, optimistic concurrency, and normalized nullable fields", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    mocks.getObjective.mockResolvedValue(goal({ purpose: null }));
    mocks.findReplay.mockResolvedValueOnce({
      id: objectiveId,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    const replay = await service.update(
      objectiveId,
      { name: "Repetição" },
      {
        expectedUpdatedAt: timestamp.toISOString(),
        idempotencyKey: "update-key",
      },
    );
    expect(replay.updatedAt).toEqual(timestamp);
    expect(mocks.update).not.toHaveBeenCalled();

    mocks.findReplay.mockResolvedValue(null);
    mocks.getObjective.mockResolvedValue(goal({ purpose: null }));
    mocks.update.mockResolvedValue({ mcpUpdated: goal({ name: "Novo" }) });
    await expect(
      service.update(
        objectiveId,
        { name: "Novo", targetAmount: null, monthlyPlannedAmount: 0 },
        {
          expectedUpdatedAt: timestamp.toISOString(),
          idempotencyKey: "update-key",
        },
      ),
    ).resolves.toMatchObject({ name: "Novo" });
    expect(mocks.update).toHaveBeenCalledWith(
      objectiveId,
      expect.objectContaining({
        purpose: null,
        targetAmount: null,
        monthlyPlannedAmount: "0.00",
      }),
      timestamp,
      expect.objectContaining({
        operation: "update_objective",
        key: "update-key",
      }),
    );
  });

  it("validates update payloads and requires a version for idempotent writes", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    await expect(
      service.update(objectiveId, { name: "" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.update(
        objectiveId,
        { name: "Novo" },
        { idempotencyKey: "update-key" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.getObjective).not.toHaveBeenCalled();
  });

  it("returns an MCP replay discovered after a concurrent version change", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    mocks.findReplay.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: objectiveId,
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    mocks.getObjective.mockResolvedValue(
      goal({ updatedAt: new Date("2026-11-13T00:00:00.000Z") }),
    );

    await expect(
      service.update(
        objectiveId,
        { name: "Férias" },
        {
          expectedUpdatedAt: timestamp.toISOString(),
          idempotencyKey: "update-key",
        },
      ),
    ).resolves.toMatchObject({ updatedAt: timestamp });
    expect(mocks.findReplay).toHaveBeenCalledTimes(2);
  });

  it("reports a concurrent version change when no replay has been recorded", async () => {
    mocks.getObjective.mockResolvedValue(
      goal({ updatedAt: new Date("2026-11-13T00:00:00.000Z") }),
    );
    mocks.findReplay.mockResolvedValue(null);

    await expect(
      new PortfolioObjectivesService().update(
        goal().id,
        { name: "Nova viagem" },
        {
          expectedUpdatedAt: timestamp.toISOString(),
          idempotencyKey: "update-key",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.findReplay).toHaveBeenCalledTimes(2);
  });

  it("hydrates repository replay updates", async () => {
    const objectiveId = goal().id;
    mocks.getObjective.mockResolvedValue(goal());
    mocks.findReplay.mockResolvedValue(null);
    mocks.update.mockResolvedValue({
      mcpReplayResult: {
        id: objectiveId,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      },
    });

    await expect(
      new PortfolioObjectivesService().update(
        objectiveId,
        { name: "Atualizado" },
        {
          expectedUpdatedAt: timestamp.toISOString(),
          idempotencyKey: "update-key",
        },
      ),
    ).resolves.toMatchObject({ createdAt: timestamp, updatedAt: timestamp });
    expect(mocks.update).toHaveBeenCalledOnce();
  });

  it("reports missing objectives and update conflicts after the write", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    mocks.getObjective.mockResolvedValue(null);
    await expect(
      service.update(objectiveId, { name: "A" }),
    ).rejects.toMatchObject({ statusCode: 404 });

    mocks.getObjective.mockResolvedValue(goal());
    mocks.update.mockResolvedValue(null);
    await expect(
      service.update(
        objectiveId,
        { name: "A" },
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    mocks.getObjective
      .mockResolvedValueOnce(goal())
      .mockResolvedValueOnce(null);
    await expect(
      service.update(
        objectiveId,
        { name: "A" },
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updates an objective and rejects stale or invalid versions", async () => {
    mocks.getObjective.mockResolvedValue(goal());
    mocks.update.mockResolvedValue(goal({ name: "Férias" }));
    const service = new PortfolioObjectivesService();

    await service.update(
      "00000000-0000-4000-8000-000000000001",
      { name: "Férias", purpose: "PERSONAL_GOAL", targetAmount: 18000 },
      { expectedUpdatedAt: timestamp.toISOString() },
    );
    expect(mocks.update).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      {
        name: "Férias",
        purpose: "PERSONAL_GOAL",
        targetAmount: "18000.00",
        monthlyPlannedAmount: null,
      },
      timestamp,
    );

    await expect(
      service.update(
        "00000000-0000-4000-8000-000000000001",
        { name: "Viagem" },
        { expectedUpdatedAt: "bad" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    mocks.getObjective.mockResolvedValue(
      goal({ updatedAt: new Date("2026-11-13T00:00:00.000Z") }),
    );
    await expect(
      service.update(
        "00000000-0000-4000-8000-000000000001",
        { name: "Férias" },
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("updates an objective without an optimistic version for the direct user flow", async () => {
    mocks.getObjective.mockResolvedValue(goal());
    mocks.update.mockResolvedValue(goal({ name: "Nova viagem" }));

    await expect(
      new PortfolioObjectivesService().update(goal().id, {
        name: "Nova viagem",
      }),
    ).resolves.toMatchObject({ name: "Nova viagem" });

    expect(mocks.update).toHaveBeenCalledWith(
      goal().id,
      expect.objectContaining({ name: "Nova viagem" }),
    );
  });

  it("prevents editing the reserve through the generic objective form", async () => {
    mocks.getObjective.mockResolvedValue(
      goal({ id: reserveObjectiveId, kind: "RESERVE" }),
    );

    await expect(
      new PortfolioObjectivesService().update(reserveObjectiveId, {
        name: "Reserva",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("deletes custom objectives and prevents deleting the reserve", async () => {
    mocks.getObjective.mockResolvedValue(goal());
    mocks.delete.mockResolvedValue(goal());
    await expect(
      new PortfolioObjectivesService().delete(
        "00000000-0000-4000-8000-000000000001",
        {},
      ),
    ).resolves.toMatchObject({ id: "00000000-0000-4000-8000-000000000001" });
    expect(mocks.delete).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );

    mocks.getObjective.mockResolvedValue(
      goal({ id: reserveObjectiveId, kind: "RESERVE" }),
    );
    await expect(
      new PortfolioObjectivesService().delete(reserveObjectiveId, {}),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("validates delete requests and supports versioned MCP deletion receipts", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    await expect(service.delete("invalid", {})).rejects.toMatchObject({
      statusCode: 400,
    });
    mocks.getObjective.mockResolvedValue(null);
    await expect(service.delete(objectiveId, {})).rejects.toMatchObject({
      statusCode: 404,
    });

    mocks.getObjective.mockResolvedValue(goal());
    mocks.delete.mockResolvedValue({ mcpReplayResult: { deleted: true } });
    await expect(
      service.delete(
        objectiveId,
        {},
        {
          expectedUpdatedAt: timestamp.toISOString(),
          mcpMutation: {
            key: "delete-key",
            payloadHash: "hash",
            replayResult: { deleted: true },
          },
        },
      ),
    ).resolves.toEqual({ mcpReplay: { deleted: true } });

    mocks.delete.mockResolvedValue({ mcpDeleted: goal() });
    await expect(
      service.delete(
        objectiveId,
        {},
        {
          expectedUpdatedAt: timestamp.toISOString(),
          mcpMutation: {
            key: "delete-key",
            payloadHash: "hash",
            replayResult: { deleted: true },
          },
        },
      ),
    ).resolves.toMatchObject({ id: objectiveId });
  });

  it("reports stale and missing deletions after a versioned write", async () => {
    const service = new PortfolioObjectivesService();
    const objectiveId = goal().id;
    mocks.getObjective.mockResolvedValue(goal({ updatedAt: new Date(0) }));
    await expect(
      service.delete(
        objectiveId,
        {},
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    mocks.getObjective.mockResolvedValue(goal());
    mocks.delete.mockResolvedValue(null);
    await expect(
      service.delete(
        objectiveId,
        {},
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    mocks.getObjective
      .mockResolvedValueOnce(goal())
      .mockResolvedValueOnce(null);
    await expect(
      service.delete(
        objectiveId,
        {},
        { expectedUpdatedAt: timestamp.toISOString() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
