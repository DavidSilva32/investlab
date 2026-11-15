import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  createMyObjective: vi.fn(),
  deleteMyObjective: vi.fn(),
  updateMyObjective: vi.fn(),
  saveMyObservedBalance: vi.fn(),
  createMyManualPosition: vi.fn(),
  updateMyManualPosition: vi.fn(),
  deleteMyManualPosition: vi.fn(),
}));

vi.mock("@/backend/services/mcp-portfolio-tools.service", () => ({
  mcpPortfolioToolsService: {
    createMyObjective: mocks.createMyObjective,
    deleteMyObjective: mocks.deleteMyObjective,
    updateMyObjective: mocks.updateMyObjective,
    saveMyObservedBalance: mocks.saveMyObservedBalance,
    createMyManualPosition: mocks.createMyManualPosition,
    updateMyManualPosition: mocks.updateMyManualPosition,
    deleteMyManualPosition: mocks.deleteMyManualPosition,
  },
}));

import { McpPortfolioWriteToolsController } from "@/backend/controllers/mcp-portfolio-write-tools.controller";

describe("McpPortfolioWriteToolsController", () => {
  const controller = new McpPortfolioWriteToolsController();
  const schemas = new Map<
    string,
    {
      safeParse: (value: unknown) => { success: boolean };
      parse: (value: unknown) => Record<string, unknown>;
    }
  >();
  const annotations = new Map<
    string,
    { destructiveHint?: boolean; readOnlyHint?: boolean }
  >();
  const handlers = new Map<string, (input: never) => Promise<unknown>>();

  beforeEach(() => {
    vi.clearAllMocks();
    schemas.clear();
    annotations.clear();
    handlers.clear();
    mocks.registerTool.mockImplementation(
      (
        name: string,
        options: {
          inputSchema: {
            safeParse: (value: unknown) => { success: boolean };
            parse: (value: unknown) => Record<string, unknown>;
          };
          annotations?: {
            destructiveHint?: boolean;
            readOnlyHint?: boolean;
          };
        },
        handler: (input: never) => Promise<unknown>,
      ) => {
        schemas.set(name, options.inputSchema);
        if (options.annotations) annotations.set(name, options.annotations);
        handlers.set(name, handler);
      },
    );
  });

  it("marks only permanent deletion tools as destructive", () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner",
      "request",
    );

    expect(annotations.get("write_delete_objective")).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(annotations.get("write_delete_manual_position")).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(annotations.get("write_create_objective")).not.toHaveProperty(
      "destructiveHint",
    );
    expect(annotations.get("write_update_objective")).not.toHaveProperty(
      "destructiveHint",
    );
  });

  it("requires a persisted idempotency key for objective creation", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const input = {
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
      targetAmount: 16000,
      monthlyPlannedAmount: 2000,
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      userId: "untrusted-owner",
    };
    const schema = schemas.get("write_create_objective")!;
    expect(
      schema.safeParse({ ...input, idempotencyKey: undefined }).success,
    ).toBe(false);
    expect(schema.parse(input)).not.toHaveProperty("userId");
    const objective = { id: "objective-1", name: input.name };
    mocks.createMyObjective.mockResolvedValue(objective);

    await handlers.get("write_create_objective")!(input as never);
    expect(mocks.createMyObjective).toHaveBeenCalledWith(
      "trusted-owner",
      {
        name: "Viagem",
        purpose: "PERSONAL_GOAL",
        targetAmount: 16000,
        monthlyPlannedAmount: 2000,
      },
      input.idempotencyKey,
    );
  });

  it("requires explicit objective fields and excludes caller-selected ownership", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner",
      "request",
    );
    const schema = schemas.get("write_update_objective")!;
    const validInput = {
      objectiveId: "a2cb9250-387c-4699-8a2b-06f9d1a9b062",
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
      targetAmount: 16000,
      monthlyPlannedAmount: 2000,
      expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      userId: "attacker-selected-owner",
    };
    expect(
      schema.safeParse({ ...validInput, targetAmount: undefined }).success,
    ).toBe(false);
    expect(schema.parse(validInput)).not.toHaveProperty("userId");

    const objective = { id: validInput.objectiveId, name: validInput.name };
    mocks.updateMyObjective.mockResolvedValue(objective);
    const result = await handlers.get("write_update_objective")!(
      validInput as never,
    );

    expect(mocks.updateMyObjective).toHaveBeenCalledWith(
      "owner",
      validInput.objectiveId,
      {
        name: "Viagem",
        purpose: "PERSONAL_GOAL",
        targetAmount: 16000,
        monthlyPlannedAmount: 2000,
      },
      "2026-11-14T15:00:00.000Z",
      validInput.idempotencyKey,
    );
    expect(result).toMatchObject({
      content: [{ type: "text", text: JSON.stringify(objective) }],
    });
  });

  it("requires identity, latest version, and literal confirmation to delete an objective", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const objectiveId = "a2cb9250-387c-4699-8a2b-06f9d1a9b062";
    const input = {
      objectiveId,
      objectiveName: "Viagem",
      expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      confirmation: `EXCLUIR OBJETIVO "Viagem" [${objectiveId}]`,
    };
    const schema = schemas.get("write_delete_objective")!;
    expect(schema.safeParse({ ...input, confirmation: "sim" }).success).toBe(
      false,
    );
    expect(schema.parse(input)).not.toHaveProperty("userId");
    mocks.deleteMyObjective.mockResolvedValue({ deleted: true });

    await handlers.get("write_delete_objective")!(input as never);
    expect(mocks.deleteMyObjective).toHaveBeenCalledWith(
      "trusted-owner",
      objectiveId,
      input.expectedUpdatedAt,
      input.objectiveName,
      input.confirmation,
      input.idempotencyKey,
      "request-1",
    );
  });

  it("requires an idempotency key for balance saves and forwards it with token ownership", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const input = {
      objectiveId: "a2cb9250-387c-4699-8a2b-06f9d1a9b062",
      amount: "56042.48",
      observedOn: "2026-11-14",
      cdiPercentage: null,
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      userId: "untrusted-owner",
    };
    const schema = schemas.get("write_save_observed_balance")!;
    expect(
      schema.safeParse({ ...input, idempotencyKey: undefined }).success,
    ).toBe(false);
    expect(schema.parse(input)).not.toHaveProperty("userId");
    mocks.saveMyObservedBalance.mockResolvedValue({
      assignmentStatus: "updated",
    });

    await handlers.get("write_save_observed_balance")!(input as never);
    expect(mocks.saveMyObservedBalance).toHaveBeenCalledWith(
      "trusted-owner",
      {
        objectiveId: input.objectiveId,
        amount: input.amount,
        observedOn: input.observedOn,
        cdiPercentage: null,
      },
      input.idempotencyKey,
      "request-1",
    );
  });

  it("requires idempotency and token ownership for manual position creation", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const input = {
      product: "ETF internacional",
      assetCode: "VT",
      quantity: 2,
      currency: "USD",
      valueBasis: "unit_price",
      unitPrice: 100,
      positionDate: "2026-11-14",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      userId: "untrusted-owner",
    };
    const schema = schemas.get("write_create_manual_position")!;
    expect(
      schema.safeParse({ ...input, idempotencyKey: undefined }).success,
    ).toBe(false);
    expect(schema.parse(input)).not.toHaveProperty("userId");
    const position = { id: "manual-id" };
    mocks.createMyManualPosition.mockResolvedValue(position);
    await handlers.get("write_create_manual_position")!(input as never);
    expect(mocks.createMyManualPosition).toHaveBeenCalledWith(
      "trusted-owner",
      expect.objectContaining({ product: input.product, assetCode: "VT" }),
      input.idempotencyKey,
      "request-1",
    );
  });

  it("requires position version for update and exact phrase for explicit deletion", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const positionId = "a2cb9250-387c-4699-8a2b-06f9d1a9b062";
    const position = {
      product: "ETF internacional",
      assetCode: "VT",
      quantity: 2,
      currency: "USD",
      valueBasis: "unit_price",
      unitPrice: 100,
      positionDate: "2026-11-14",
      positionId,
      expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      userId: "untrusted-owner",
    };
    const updateSchema = schemas.get("write_update_manual_position")!;
    expect(
      updateSchema.safeParse({ ...position, expectedUpdatedAt: undefined })
        .success,
    ).toBe(false);
    expect(updateSchema.parse(position)).not.toHaveProperty("userId");
    mocks.updateMyManualPosition.mockResolvedValue({ id: positionId });
    await handlers.get("write_update_manual_position")!(position as never);
    expect(mocks.updateMyManualPosition).toHaveBeenCalledWith(
      "trusted-owner",
      positionId,
      expect.objectContaining({ product: position.product }),
      position.expectedUpdatedAt,
      position.idempotencyKey,
      "request-1",
    );

    const deletion = {
      positionId,
      positionIdentity: "ETF internacional (VT)",
      expectedUpdatedAt: position.expectedUpdatedAt,
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      confirmation: `EXCLUIR POSIÇÃO "ETF internacional (VT)" [${positionId}]`,
      userId: "untrusted-owner",
    };
    const deleteSchema = schemas.get("write_delete_manual_position")!;
    expect(
      deleteSchema.safeParse({ ...deletion, confirmation: "sim" }).success,
    ).toBe(false);
    expect(deleteSchema.parse(deletion)).not.toHaveProperty("userId");
    mocks.deleteMyManualPosition.mockResolvedValue({ deleted: true });
    await handlers.get("write_delete_manual_position")!(deletion as never);
    expect(mocks.deleteMyManualPosition).toHaveBeenCalledWith(
      "trusted-owner",
      positionId,
      position.expectedUpdatedAt,
      deletion.positionIdentity,
      deletion.confirmation,
      deletion.idempotencyKey,
      "request-1",
    );
  });

  it("converts failures from every write tool to the safe MCP error response", async () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "trusted-owner",
      "request-1",
    );
    const input = {
      name: "Viagem",
      purpose: "PERSONAL_GOAL",
      targetAmount: 16000,
      monthlyPlannedAmount: 2000,
      objectiveId: "a2cb9250-387c-4699-8a2b-06f9d1a9b062",
      amount: "56042.48",
      observedOn: "2026-11-14",
      cdiPercentage: null,
      expectedUpdatedAt: "2026-11-14T15:00:00.000Z",
      idempotencyKey: "f1d92f3e-9168-493f-905b-30726d292aa7",
      confirmation:
        'EXCLUIR OBJETIVO "Viagem" [a2cb9250-387c-4699-8a2b-06f9d1a9b062]',
      objectiveName: "Viagem",
      product: "ETF internacional",
      assetCode: "VT",
      quantity: 2,
      currency: "USD",
      valueBasis: "unit_price",
      unitPrice: 100,
      positionDate: "2026-11-14",
      positionId: "a2cb9250-387c-4699-8a2b-06f9d1a9b062",
      positionIdentity: "ETF internacional (VT)",
    };
    const toolMocks = [
      ["write_create_objective", mocks.createMyObjective],
      ["write_update_objective", mocks.updateMyObjective],
      ["write_delete_objective", mocks.deleteMyObjective],
      ["write_save_observed_balance", mocks.saveMyObservedBalance],
      ["write_create_manual_position", mocks.createMyManualPosition],
      ["write_update_manual_position", mocks.updateMyManualPosition],
      ["write_delete_manual_position", mocks.deleteMyManualPosition],
    ] as const;

    for (const [toolName, serviceMock] of toolMocks) {
      serviceMock.mockRejectedValueOnce(new Error("database secret details"));
      await expect(handlers.get(toolName)!(input as never)).resolves.toEqual({
        isError: true,
        content: [
          {
            type: "text",
            text: "Não foi possível concluir a operação no InvestLab.",
          },
        ],
      });
    }
  });
});
