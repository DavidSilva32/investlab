import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listManualPositions: vi.fn(),
  createManualPosition: vi.fn(),
  updateManualPosition: vi.fn(),
  deleteManualPosition: vi.fn(),
  getEmergencyReserveEditorData: vi.fn(),
  getObjectivesOverview: vi.fn(),
  updateObjective: vi.fn(),
  createObjective: vi.fn(),
  deleteObjective: vi.fn(),
  saveObservedBalance: vi.fn(),
  getLongTermStrategyOverview: vi.fn(),
  getAllocationOverview: vi.fn(),
  getAllocationTargets: vi.fn(),
  getMonthlyReview: vi.fn(),
  listRecentOperations: vi.fn(),
  simulateObjectiveProjection: vi.fn(),
  getMarketByTicker: vi.fn(),
  runWithDataOwner: vi.fn((userId: string, operation: () => unknown) => {
    mocks.runWithDataOwnerCall(userId);
    return operation();
  }),
  runWithDataOwnerCall: vi.fn(),
  findMcpMutationReplay: vi.fn(),
}));

vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: { getOverview: mocks.getOverview },
}));
vi.mock("@/backend/services/manual-portfolio-position.service", () => ({
  manualPortfolioPositionService: {
    list: mocks.listManualPositions,
    create: mocks.createManualPosition,
    update: mocks.updateManualPosition,
    delete: mocks.deleteManualPosition,
  },
}));
vi.mock("@/backend/services/emergency-reserve.service", () => ({
  emergencyReserveService: {
    getEditorData: mocks.getEmergencyReserveEditorData,
  },
}));
vi.mock("@/backend/services/portfolio-objectives.service", () => ({
  portfolioObjectivesService: {
    getOverview: mocks.getObjectivesOverview,
    create: mocks.createObjective,
    delete: mocks.deleteObjective,
    update: mocks.updateObjective,
  },
}));
vi.mock("@/backend/services/personal-investment-strategy.service", () => ({
  personalInvestmentStrategyService: {
    getOverview: mocks.getLongTermStrategyOverview,
  },
}));
vi.mock("@/backend/services/portfolio-allocation.service", () => ({
  portfolioAllocationService: {
    getAllocationOverview: mocks.getAllocationOverview,
    getAllocationTargets: mocks.getAllocationTargets,
  },
}));
vi.mock("@/backend/services/portfolio-operation.service", () => ({
  portfolioOperationService: { listRecentForMcp: mocks.listRecentOperations },
}));
vi.mock("@/backend/services/objective-projection.service", () => ({
  objectiveProjectionService: { simulate: mocks.simulateObjectiveProjection },
}));
vi.mock("@/backend/services/objective-balance.service", () => ({
  objectiveBalanceService: { save: mocks.saveObservedBalance },
}));
vi.mock("@/backend/services/stock-analysis.service", () => ({
  stockAnalysisService: { getMarketByTicker: mocks.getMarketByTicker },
}));
vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: {
    getOverview: mocks.getOverview,
    getMonthlyReview: mocks.getMonthlyReview,
  },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  runWithDataOwner: mocks.runWithDataOwner,
}));
vi.mock("@/backend/repositories/mcp-mutation-replays.repository", () => ({
  mcpMutationReplaysRepository: { find: mocks.findMcpMutationReplay },
}));

import { McpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";

describe("McpPortfolioToolsService read tools", () => {
  const service = new McpPortfolioToolsService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMcpMutationReplay.mockResolvedValue(null);
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [] });
  });

  it("reads portfolio value, positions, and movements inside the token owner's context", async () => {
    const overview = {
      valuationDate: "2026-10-19",
      positions: [
        {
          id: "position-1",
          product: "ETF",
          assetCode: "VOO",
          source: "MANUAL",
          quantity: "2",
          totalValue: "1500.25",
          referenceDate: "2026-10-19",
        },
        undefined,
      ],
      movements: [{ id: "movement-1", type: "BUY", amount: "1500.25" }],
    };
    mocks.getOverview.mockResolvedValue(overview);

    const result = await service.getMyPortfolio("owner-from-sub", "req-1");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.getOverview).toHaveBeenCalledWith("req-1");
    expect(result).toEqual({
      valuationDate: "2026-10-19",
      positionCount: 1,
      positions: [
        {
          id: "position-1",
          product: "ETF",
          assetCode: "VOO",
          source: "MANUAL",
          quantity: "2",
          value: "1500.25",
          valueDate: "2026-10-19",
        },
      ],
      knownValueBrl: 1500.25,
      movements: overview.movements,
    });
    expect(JSON.stringify(result)).not.toContain("other-user");
  });

  it("updates an objective only inside the trusted token owner's context", async () => {
    const input = {
      name: "Viagem",
      purpose: "PERSONAL_GOAL" as const,
      targetAmount: 10000,
      monthlyPlannedAmount: 1000,
    };
    const objective = { id: "objective-id", ...input };
    mocks.updateObjective.mockResolvedValue(objective);

    await expect(
      service.updateMyObjective(
        "owner-from-sub",
        "objective-id",
        input,
        "2026-11-14T15:00:00.000Z",
        "f1d92f3e-9168-493f-905b-30726d292aa7",
      ),
    ).resolves.toBe(objective);

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.updateObjective).toHaveBeenCalledWith("objective-id", input, {
      expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
    });
  });

  it("creates and updates manual positions only inside the token owner's context", async () => {
    const position = { id: "manual-id", product: "ETF", assetCode: "VT" };
    const input = { product: "ETF", assetCode: "VT", quantity: 2 };
    mocks.createManualPosition.mockResolvedValue(position);
    mocks.updateManualPosition.mockResolvedValue(position);

    await expect(
      service.createMyManualPosition(
        "trusted-owner",
        input,
        "f1d92f3e-9168-493f-905b-30726d292aa7",
        "request-id",
      ),
    ).resolves.toBe(position);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("trusted-owner");
    expect(mocks.createManualPosition).toHaveBeenCalledWith(
      input,
      "request-id",
      { idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7" },
    );

    await service.updateMyManualPosition(
      "trusted-owner",
      "manual-id",
      input,
      "2026-11-14T15:00:00.000Z",
      "f1d92f3e-9168-493f-905b-30726d292aa7",
      "request-id",
    );
    expect(mocks.updateManualPosition).toHaveBeenCalledWith(
      "manual-id",
      input,
      "request-id",
      {
        expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
        idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      },
    );
  });

  it("generates request IDs for manual position writes when context is omitted", async () => {
    const position = { id: "manual-id" };
    mocks.createManualPosition.mockResolvedValue(position);
    mocks.updateManualPosition.mockResolvedValue(position);

    await service.createMyManualPosition(
      "trusted-owner",
      { product: "CDB" },
      "create-key",
    );
    await service.updateMyManualPosition(
      "trusted-owner",
      "manual-id",
      { product: "CDB" },
      "2026-11-14T15:00:00.000Z",
      "update-key",
    );

    const createRequestId = mocks.createManualPosition.mock.calls[0][1];
    const updateRequestId = mocks.updateManualPosition.mock.calls[0][2];
    expect(createRequestId).toMatch(/^[\da-f-]{36}$/i);
    expect(updateRequestId).toMatch(/^[\da-f-]{36}$/i);
    expect(createRequestId).not.toBe(updateRequestId);
  });

  it("deletes only the exact current manual position after explicit confirmation", async () => {
    const position = {
      id: "manual-id",
      product: "ETF internacional",
      assetCode: "VT",
      lastUpdatedAt: "2026-11-14T15:00:00.000Z",
    };
    mocks.listManualPositions.mockResolvedValue([position]);
    mocks.deleteManualPosition.mockResolvedValue({ id: position.id });

    await expect(
      service.deleteMyManualPosition(
        "trusted-owner",
        position.id,
        position.lastUpdatedAt,
        "ETF internacional (VT)",
        `EXCLUIR POSIÇÃO "ETF internacional (VT)" [${position.id}]`,
        "f1d92f3e-9168-493f-905b-30726d292aa7",
        "request-id",
      ),
    ).resolves.toMatchObject({
      deleted: true,
      positionId: position.id,
      historicalSnapshotsRetained: true,
    });
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("trusted-owner");
    expect(mocks.deleteManualPosition).toHaveBeenCalledWith(
      position.id,
      "request-id",
      {
        expectedUpdatedAt: position.lastUpdatedAt,
        mcpMutation: expect.objectContaining({
          key: "f1d92f3e-9168-493f-905b-30726d292aa7",
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          replayResult: expect.objectContaining({ positionId: position.id }),
        }),
      },
    );
  });

  it("rejects stale manual position versions or confirmation identities", async () => {
    const position = {
      id: "manual-id",
      product: "ETF internacional",
      assetCode: "VT",
      lastUpdatedAt: "2026-11-14T15:00:00.000Z",
    };
    mocks.listManualPositions.mockResolvedValue([position]);
    await expect(
      service.deleteMyManualPosition(
        "owner",
        position.id,
        "2026-11-13T15:00:00.000Z",
        "ETF internacional (VT)",
        `EXCLUIR POSIÇÃO "ETF internacional (VT)" [${position.id}]`,
        "f1d92f3e-9168-493f-905b-30726d292aa7",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.deleteMyManualPosition(
        "owner",
        position.id,
        position.lastUpdatedAt,
        "ETF internacional (VT)",
        "sim",
        "f1d92f3e-9168-493f-905b-30726d292aa7",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.deleteManualPosition).not.toHaveBeenCalled();
  });

  it("replays a completed manual position deletion and recovers a concurrent retry", async () => {
    const replay = { deleted: true, positionId: "manual-id", replayed: true };
    mocks.findMcpMutationReplay
      .mockResolvedValueOnce(replay)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay);
    mocks.listManualPositions.mockResolvedValue([]);

    await expect(
      service.deleteMyManualPosition(
        "owner",
        "manual-id",
        "2026-11-14T15:00:00.000Z",
        "CDB",
        'EXCLUIR POSIÇÃO "CDB" [manual-id]',
        "manual-delete-replay-key",
      ),
    ).resolves.toBe(replay);
    expect(mocks.listManualPositions).not.toHaveBeenCalled();

    await expect(
      service.deleteMyManualPosition(
        "owner",
        "manual-id",
        "2026-11-14T15:00:00.000Z",
        "CDB",
        'EXCLUIR POSIÇÃO "CDB" [manual-id]',
        "manual-delete-race-key",
      ),
    ).resolves.toBe(replay);
    expect(mocks.listManualPositions).toHaveBeenCalledTimes(1);
    expect(mocks.deleteManualPosition).not.toHaveBeenCalled();
  });

  it("fails when a manual position is missing and no concurrent deletion replay exists", async () => {
    mocks.findMcpMutationReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.listManualPositions.mockResolvedValue([]);

    await expect(
      service.deleteMyManualPosition(
        "owner",
        "missing-id",
        "2026-11-14T15:00:00.000Z",
        "CDB",
        'EXCLUIR POSIÇÃO "CDB" [missing-id]',
        "manual-delete-missing-key",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns the stored receipt after deleting an un-coded manual position", async () => {
    const position = {
      id: "manual-no-code",
      product: "CDB do banco",
      lastUpdatedAt: "2026-11-14T15:00:00.000Z",
    };
    const replayResult = { deleted: true, positionId: position.id };
    mocks.listManualPositions.mockResolvedValue([position]);
    mocks.deleteManualPosition.mockResolvedValue({
      mcpReplayResult: replayResult,
    });

    await expect(
      service.deleteMyManualPosition(
        "owner",
        position.id,
        position.lastUpdatedAt,
        "CDB do banco",
        `EXCLUIR POSIÇÃO "CDB do banco" [${position.id}]`,
        "manual-delete-stored-result-key",
      ),
    ).resolves.toEqual({ mcpReplayResult: replayResult });
    expect(mocks.deleteManualPosition).toHaveBeenCalledWith(
      position.id,
      undefined,
      expect.objectContaining({
        expectedUpdatedAt: position.lastUpdatedAt,
        mcpMutation: expect.objectContaining({
          replayResult: expect.objectContaining({ positionId: position.id }),
        }),
      }),
    );
  });

  it("deletes only the current objective identity after exact owner confirmation", async () => {
    const objective = {
      id: "objective-id",
      name: "Viagem",
      updatedAt: "2026-11-14T15:00:00.000Z",
      assignedPositionCount: 2,
    };
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [objective] });
    mocks.deleteObjective.mockResolvedValue(objective);

    await expect(
      service.deleteMyObjective(
        "trusted-owner",
        objective.id,
        objective.updatedAt,
        objective.name,
        `EXCLUIR OBJETIVO "Viagem" [${objective.id}]`,
        "f1d92f3e-9168-493f-905b-30726d292aa7",
        "request-id",
      ),
    ).resolves.toMatchObject({
      deleted: true,
      objectiveId: objective.id,
      unlinkedPositionCount: 2,
      positionsRetained: true,
    });
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("trusted-owner");
    expect(mocks.deleteObjective).toHaveBeenCalledWith(
      objective.id,
      { objectiveId: objective.id },
      {
        expectedUpdatedAt: objective.updatedAt,
        mcpMutation: expect.objectContaining({
          key: "f1d92f3e-9168-493f-905b-30726d292aa7",
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      },
    );
  });

  it("rejects an objective deletion when its identity or version is stale", async () => {
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          id: "objective-id",
          name: "Viagem",
          updatedAt: "2026-11-15T10:00:00.000Z",
          assignedPositionCount: 1,
        },
      ],
    });

    await expect(
      service.deleteMyObjective(
        "trusted-owner",
        "objective-id",
        "2026-11-14T15:00:00.000Z",
        "Viagem",
        'EXCLUIR OBJETIVO "Viagem" [objective-id]',
        "f1d92f3e-9168-493f-905b-30726d292aa7",
        "request-id",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.deleteObjective).not.toHaveBeenCalled();

    await expect(
      service.deleteMyObjective(
        "trusted-owner",
        "objective-id",
        "2026-11-15T10:00:00.000Z",
        "Outro objetivo",
        'EXCLUIR OBJETIVO "Outro objetivo" [objective-id]',
        "f1d92f3e-9168-493f-905b-30726d292aa7",
        "request-id",
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.deleteObjective).not.toHaveBeenCalled();
  });

  it("replays objective deletion results and recovers concurrent retries", async () => {
    const replay = {
      deleted: true,
      objectiveId: "objective-id",
      replayed: true,
    };
    mocks.findMcpMutationReplay
      .mockResolvedValueOnce(replay)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay);
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [] });

    await expect(
      service.deleteMyObjective(
        "owner",
        "objective-id",
        "2026-11-14T15:00:00.000Z",
        "Viagem",
        'EXCLUIR OBJETIVO "Viagem" [objective-id]',
        "objective-delete-replay-key",
        "request-id",
      ),
    ).resolves.toBe(replay);
    expect(mocks.getObjectivesOverview).not.toHaveBeenCalled();

    await expect(
      service.deleteMyObjective(
        "owner",
        "objective-id",
        "2026-11-14T15:00:00.000Z",
        "Viagem",
        'EXCLUIR OBJETIVO "Viagem" [objective-id]',
        "objective-delete-race-key",
        "request-id",
      ),
    ).resolves.toBe(replay);
    expect(mocks.getObjectivesOverview).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObjective).not.toHaveBeenCalled();
  });

  it("rejects an incorrect objective deletion confirmation before writing", async () => {
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          id: "objective-id",
          name: "Viagem",
          updatedAt: "2026-11-14T15:00:00.000Z",
          assignedPositionCount: 1,
        },
      ],
    });

    await expect(
      service.deleteMyObjective(
        "owner",
        "objective-id",
        "2026-11-14T15:00:00.000Z",
        "Viagem",
        "EXCLUIR",
        "objective-delete-bad-confirmation",
        "request-id",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.deleteObjective).not.toHaveBeenCalled();
  });

  it("returns a repository-provided objective deletion replay receipt", async () => {
    const objective = {
      id: "objective-id",
      name: "Viagem",
      updatedAt: "2026-11-14T15:00:00.000Z",
      assignedPositionCount: 1,
    };
    const replay = { deleted: true, objectiveId: objective.id, replayed: true };
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [objective] });
    mocks.deleteObjective.mockResolvedValue({ mcpReplay: replay });

    await expect(
      service.deleteMyObjective(
        "owner",
        objective.id,
        objective.updatedAt,
        objective.name,
        `EXCLUIR OBJETIVO "${objective.name}" [${objective.id}]`,
        "objective-delete-stored-result-key",
        "request-id",
      ),
    ).resolves.toBe(replay);
  });

  it("fails when an objective is missing and no concurrent deletion replay exists", async () => {
    mocks.findMcpMutationReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [] });

    await expect(
      service.deleteMyObjective(
        "owner",
        "missing-id",
        "2026-11-14T15:00:00.000Z",
        "Viagem",
        'EXCLUIR OBJETIVO "Viagem" [missing-id]',
        "objective-delete-missing-key",
        "request-id",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("creates an objective inside the trusted token owner's context", async () => {
    const input = {
      name: "Viagem",
      purpose: "PERSONAL_GOAL" as const,
      targetAmount: 16000,
      monthlyPlannedAmount: 2000,
    };
    const objective = { id: "objective-id", ...input };
    mocks.createObjective.mockResolvedValue(objective);

    await expect(
      service.createMyObjective(
        "trusted-owner",
        input,
        "create-idempotency-key",
      ),
    ).resolves.toBe(objective);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("trusted-owner");
    expect(mocks.createObjective).toHaveBeenCalledWith(input, {
      idempotencyKey: "create-idempotency-key",
    });
  });

  it("saves an observed balance with the token owner and caller idempotency key", async () => {
    const input = {
      objectiveId: "objective-id",
      amount: "56042.48",
      observedOn: "2026-11-14",
      cdiPercentage: null,
    };
    const result = {
      objectiveId: input.objectiveId,
      assignmentStatus: "updated",
    };
    mocks.saveObservedBalance.mockResolvedValue(result);

    await expect(
      service.saveMyObservedBalance(
        "trusted-owner",
        input,
        "idempotency-key",
        "request-id",
      ),
    ).resolves.toBe(result);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("trusted-owner");
    expect(mocks.saveObservedBalance).toHaveBeenCalledWith(
      input,
      "request-id",
      {
        idempotencyKey: "idempotency-key",
      },
    );
  });

  it("lists manual positions under the same authenticated owner", async () => {
    const positions = [{ id: "position-1" }];
    mocks.listManualPositions.mockResolvedValue(positions);

    await expect(
      service.listMyManualPositions("owner-from-sub", "req-2"),
    ).resolves.toBe(positions);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.listManualPositions).toHaveBeenCalledWith("req-2");
  });

  it("returns only the connected owner's emergency reserve summary", async () => {
    const calculation = {
      monthlyExpenses: 4200,
      monthlyExpensesCents: "420000",
      targetMonths: 12,
      selectedValue: 50642.41,
      selectedValueCents: "5064241",
      selectedGroups: 1,
      unvaluedGroups: 0,
      referenceDate: "2026-11-13",
      targetValue: 50400,
      coveredMonths: 12.05,
      progressPercentage: 100,
      status: "above_target",
    };
    mocks.getEmergencyReserveEditorData.mockResolvedValue({
      calculation,
      holdings: [{ ticker: "CDB-PRIVATE" }],
    });
    mocks.getObjectivesOverview.mockResolvedValue({ objectives: [] });

    await expect(
      service.getMyEmergencyReserve("owner-from-sub", "req-reserve"),
    ).resolves.toMatchObject({
      ...calculation,
      balanceSource: "linked_positions",
      balanceDate: "2026-11-13",
    });
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.getEmergencyReserveEditorData).toHaveBeenCalledWith(
      "req-reserve",
    );
    expect(mocks.getObjectivesOverview).toHaveBeenCalledWith("req-reserve");
  });

  it("uses the observed reserve balance and date for its MCP coverage", async () => {
    mocks.getEmergencyReserveEditorData.mockResolvedValue({
      calculation: {
        monthlyExpenses: 4200,
        monthlyExpensesCents: "420000",
        targetMonths: 12,
        selectedValue: 50642.41,
        selectedValueCents: "5064241",
        selectedGroups: 1,
        unvaluedGroups: 0,
        referenceDate: "2026-11-13",
        targetValue: 50400,
        coveredMonths: 12.05,
        progressPercentage: 100,
        status: "above_target",
      },
    });
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          kind: "RESERVE",
          balanceTracking: {
            observedAmountCents: "5604248",
            observedOn: "2026-11-14",
          },
        },
      ],
    });

    const result = await service.getMyEmergencyReserve(
      "owner-from-sub",
      "req-reserve-observed",
    );

    expect(result).toMatchObject({
      selectedValue: 56042.48,
      selectedValueCents: "5604248",
      difference: -5642.48,
      status: "above_target",
      balanceSource: "observed_balance",
      balanceDate: "2026-11-14",
    });
    expect(result.coveredMonths).toBeCloseTo(13.3434, 4);
  });

  it("preserves an unconfigured empty reserve and propagates data errors", async () => {
    const unconfiguredCalculation = {
      monthlyExpenses: null,
      targetMonths: null,
      selectedValue: 0,
      targetValue: null,
      coveredMonths: null,
      status: "not_configured",
    };
    mocks.getEmergencyReserveEditorData.mockResolvedValue({
      calculation: unconfiguredCalculation,
      holdings: [],
    });
    await expect(service.getMyEmergencyReserve("owner-empty")).resolves.toEqual(
      {
        ...unconfiguredCalculation,
        balanceSource: "linked_positions",
        balanceDate: null,
      },
    );
    expect(mocks.getEmergencyReserveEditorData).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-empty");

    mocks.getEmergencyReserveEditorData.mockRejectedValue(
      new Error("database unavailable"),
    );
    await expect(
      service.getMyEmergencyReserve("owner-error", "req-error"),
    ).rejects.toThrow("database unavailable");
  });

  it("returns objective summaries without detailed positions under the owner's context", async () => {
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [
        {
          kind: "GOAL",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 10000,
          monthlyPlannedAmount: 500,
          currentValue: 2500,
          knownValue: 2500,
          remainingAmount: 7500,
          progressPercent: 25,
          assignedPositionCount: 1,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          assignedAssetKeys: ["private-asset-key"],
          balanceTracking: null,
        },
      ],
      destinationSummary: { knownTotal: 2500 },
      positions: [{ assetCode: "private-position" }],
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });

    const result = await service.getMyObjectives("owner-objectives", "req-obj");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-objectives");
    expect(mocks.getObjectivesOverview).toHaveBeenCalledWith("req-obj");
    expect(result).toEqual({
      objectives: [
        {
          kind: "GOAL",
          purpose: "PERSONAL_GOAL",
          name: "Viagem",
          targetAmount: 10000,
          monthlyPlannedAmount: 500,
          currentValue: 2500,
          knownValue: 2500,
          remainingAmount: 7500,
          progressPercent: 25,
          assignedPositionCount: 1,
          missingPositionCount: 0,
          unvaluedPositionCount: 0,
          balanceTracking: null,
        },
      ],
      destinationSummary: { knownTotal: 2500 },
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });
    expect(JSON.stringify(result)).not.toContain("private-position");
    expect(JSON.stringify(result)).not.toContain("private-asset-key");
  });

  it("reads strategy, allocation, and monthly review in the connected owner's context", async () => {
    const strategy = { longTermWealth: { knownValueCents: "100000" } };
    const allocation = {
      positions: [{ assetCode: "VOO" }],
      concentrations: { asset: [{ label: "VOO", percentage: 60 }] },
      classDistribution: [{ label: "ETFs internacionais", percentage: 60 }],
    };
    mocks.getLongTermStrategyOverview.mockResolvedValue(strategy);
    mocks.getAllocationOverview.mockResolvedValue(allocation);
    mocks.getAllocationTargets.mockResolvedValue({ international_etfs: 60 });
    mocks.getMonthlyReview.mockResolvedValue({
      selectedPeriod: "2026-09",
      availablePeriods: ["2026-09", "2026-08"],
      status: "ready",
      dateAlignment: "aligned",
      compositionCoverage: "equivalent",
      valuationMethodCoverage: "equivalent",
      current: { knownValueCents: "100000" },
      previous: { knownValueCents: "90000" },
      observedChangeCents: "10000",
      gapMonths: 0,
      untrackedManualPositionCount: 0,
      flowSeparation: { status: "unavailable" },
      history: [{ period: "2026-09" }],
    });

    await expect(
      service.getMyLongTermStrategy("owner-strategy", "req-strategy"),
    ).resolves.toBe(strategy);
    await expect(
      service.getMyPortfolioAllocation("owner-allocation", "req-allocation"),
    ).resolves.toEqual({
      positionCount: 1,
      classDistribution: allocation.classDistribution,
      concentrations: allocation.concentrations,
      targetPercentages: { international_etfs: 60 },
    });
    await expect(
      service.getMyMonthlyPortfolioReview(
        "owner-review",
        "2026-09",
        "req-review",
      ),
    ).resolves.toEqual({
      selectedPeriod: "2026-09",
      availablePeriods: ["2026-09", "2026-08"],
      status: "ready",
      dateAlignment: "aligned",
      compositionCoverage: "equivalent",
      valuationMethodCoverage: "equivalent",
      current: { knownValueCents: "100000" },
      previous: { knownValueCents: "90000" },
      observedChangeCents: "10000",
      gapMonths: 0,
      untrackedManualPositionCount: 0,
      flowSeparation: { status: "unavailable" },
    });
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      1,
      "owner-strategy",
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      2,
      "owner-allocation",
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenNthCalledWith(
      3,
      "owner-review",
    );
    expect(mocks.getLongTermStrategyOverview).toHaveBeenCalledWith(
      "req-strategy",
    );
    expect(mocks.getAllocationOverview).toHaveBeenCalledWith("req-allocation");
    expect(mocks.getAllocationTargets).toHaveBeenCalledWith("req-allocation");
    expect(mocks.getMonthlyReview).toHaveBeenCalledWith(
      "2026-09",
      "req-review",
    );
  });

  it("returns the already bounded recent operation and reconciliation window in the owner's context", async () => {
    mocks.listRecentOperations.mockResolvedValue({
      operations: [
        {
          id: "new-op",
          side: "SELL",
          effectiveDate: "2026-10-01",
          product: "ETF",
          assetCode: "VOO",
          quantity: "1",
          unitPrice: "500",
          currency: "USD",
          fees: null,
        },
        {
          id: "old-op",
          side: "BUY",
          effectiveDate: "2026-01-01",
          product: "Old",
          idempotencyKey: "private-key",
        },
      ],
      movements: [{ id: "movement-1", occurredAt: "2026-10-01" }],
      reconciliationEvents: [
        {
          operationId: "old-op",
          movementId: "movement-2",
          status: "LINK",
          eventOrder: 3,
        },
      ],
      hasMore: {
        operations: false,
        movements: true,
        reconciliationEvents: false,
      },
    });

    const result = await service.getMyOperations("owner-ops", "req-ops");

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-ops");
    expect(mocks.listRecentOperations).toHaveBeenCalledWith("req-ops");
    expect(result).toMatchObject({
      returnedCounts: { operations: 2, movements: 1, reconciliationEvents: 1 },
      operations: [{ id: "new-op", assetCode: "VOO" }, { id: "old-op" }],
      hasMore: {
        operations: false,
        movements: true,
        reconciliationEvents: false,
      },
    });
    expect(result.limitations).toContain("não representam o estado atual");
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(result.hasMore).toEqual({
      operations: false,
      movements: true,
      reconciliationEvents: false,
    });
  });

  it("creates request IDs when optional MCP read context is omitted", async () => {
    mocks.listRecentOperations.mockResolvedValue({
      operations: [],
      movements: [],
      reconciliationEvents: [],
      hasMore: {
        operations: false,
        movements: false,
        reconciliationEvents: false,
      },
    });
    mocks.getObjectivesOverview.mockResolvedValue({
      objectives: [],
      destinationSummary: {},
      unassignedKnownValue: 0,
      unassignedPositionCount: 0,
      unassignedUnvaluedPositionCount: 0,
    });
    mocks.getLongTermStrategyOverview.mockResolvedValue({ strategy: null });
    mocks.getAllocationOverview.mockResolvedValue({
      positions: [],
      classDistribution: [],
      concentrations: {},
    });
    mocks.getAllocationTargets.mockResolvedValue({});
    mocks.getMonthlyReview.mockResolvedValue({
      selectedPeriod: null,
      availablePeriods: [],
      status: "empty",
    });

    await service.getMyOperations("owner-ops-no-request-id");
    await service.getMyObjectives("owner-objectives-no-request-id");
    await service.getMyLongTermStrategy("owner-strategy-no-request-id");
    await service.getMyPortfolioAllocation("owner-allocation-no-request-id");
    await service.getMyMonthlyPortfolioReview("owner-review-no-request-id");

    for (const requestId of [
      mocks.listRecentOperations.mock.calls[0][0],
      mocks.getObjectivesOverview.mock.calls[0][0],
      mocks.getLongTermStrategyOverview.mock.calls[0][0],
      mocks.getAllocationOverview.mock.calls[0][0],
      mocks.getAllocationTargets.mock.calls[0][0],
      mocks.getMonthlyReview.mock.calls[0][1],
    ]) {
      expect(requestId).toMatch(/^[\da-f-]{36}$/i);
    }
  });

  it("calculates a hypothetical objective projection without returning monthly detail", async () => {
    const input = {
      mode: "project_balance" as const,
      startingAmount: 1000,
      monthlyContribution: 100,
      horizonYears: 1,
      annualReturnPercent: 5,
      annualInflationPercent: 3,
      adjustContributionsForInflation: false,
    };
    mocks.simulateObjectiveProjection.mockReturnValue({
      ...input,
      projectedNominalAmount: 2300,
      projectedPurchasingPowerAmount: 2200,
      totalInvestedAmount: 2200,
      nominalGrowthAmount: 100,
      requiredMonthlyContribution: null,
      contributionTiming: "end_of_month",
      points: [{ year: 0, nominalAmount: 1000 }],
      months: [{ month: 1, nominalAmount: 1100 }],
    });

    const result = await service.simulateMyObjectiveProjection(
      "owner-sim",
      input,
    );

    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-sim");
    expect(mocks.simulateObjectiveProjection).toHaveBeenCalledWith(input);
    expect(result).toMatchObject({
      projectedNominalAmount: 2300,
      monthlyDetailIncluded: false,
      interpretation: expect.stringContaining("hipotética"),
    });
    expect(result).not.toHaveProperty("months");
  });

  it("retrieves only bounded market quote fields and reports unavailable tickers", async () => {
    mocks.getMarketByTicker.mockImplementation(async (ticker: string) => {
      if (ticker === "ABCD4") throw new Error("provider detail");
      return {
        ticker,
        companyName: "Empresa",
        price: 12.34,
        priceUpdatedAt: "2026-10-19T12:00:00.000Z",
        cnpj: "private-cnpj",
        logoUrl: "private-logo",
      };
    });

    const result = await service.getMarketQuotes(
      [" abcd3 ", "ABCD4", "ABCD3"],
      "req-market",
    );

    expect(mocks.getMarketByTicker).toHaveBeenCalledTimes(2);
    expect(mocks.getMarketByTicker).toHaveBeenNthCalledWith(
      1,
      "ABCD3",
      "req-market",
    );
    expect(mocks.getMarketByTicker).toHaveBeenNthCalledWith(
      2,
      "ABCD4",
      "req-market",
    );
    expect(result.results).toEqual([
      {
        ticker: "ABCD3",
        companyName: "Empresa",
        price: 12.34,
        observedAt: "2026-10-19T12:00:00.000Z",
      },
    ]);
    expect(result.unavailableTickers).toEqual(["ABCD4"]);
    expect(JSON.stringify(result)).not.toContain("private-cnpj");
    expect(JSON.stringify(result)).not.toContain("private-logo");
  });

  it("creates request identifiers when callers omit them and treats unknown values as zero", async () => {
    mocks.getOverview.mockResolvedValue({
      valuationDate: null,
      positions: [
        {
          id: "position-null-value",
          product: "CDB",
          assetCode: "CDB-1",
          source: "MANUAL",
          quantity: null,
          totalValue: null,
          referenceDate: null,
        },
      ],
      movements: [],
    });

    await expect(
      service.getMyPortfolio("owner-no-request-id"),
    ).resolves.toMatchObject({
      positionCount: 1,
      knownValueBrl: 0,
    });
    expect(mocks.getOverview).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith(
      "owner-no-request-id",
    );

    mocks.listManualPositions.mockResolvedValue([]);
    await expect(
      service.listMyManualPositions("owner-no-request-id"),
    ).resolves.toEqual([]);
    expect(mocks.listManualPositions).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/i),
    );
  });
});
