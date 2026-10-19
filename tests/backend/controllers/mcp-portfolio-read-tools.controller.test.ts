import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  getMyPortfolio: vi.fn(),
  listMyManualPositions: vi.fn(),
  getMyEmergencyReserve: vi.fn(),
  getMyObjectives: vi.fn(),
  getMyLongTermStrategy: vi.fn(),
  getMyPortfolioAllocation: vi.fn(),
  getMyMonthlyPortfolioReview: vi.fn(),
  getMyOperations: vi.fn(),
  simulateMyObjectiveProjection: vi.fn(),
  getMarketQuotes: vi.fn(),
}));

vi.mock("@/backend/services/mcp-portfolio-tools.service", () => ({
  mcpPortfolioToolsService: {
    getMyPortfolio: mocks.getMyPortfolio,
    listMyManualPositions: mocks.listMyManualPositions,
    getMyEmergencyReserve: mocks.getMyEmergencyReserve,
    getMyObjectives: mocks.getMyObjectives,
    getMyLongTermStrategy: mocks.getMyLongTermStrategy,
    getMyPortfolioAllocation: mocks.getMyPortfolioAllocation,
    getMyMonthlyPortfolioReview: mocks.getMyMonthlyPortfolioReview,
    getMyOperations: mocks.getMyOperations,
    simulateMyObjectiveProjection: mocks.simulateMyObjectiveProjection,
    getMarketQuotes: mocks.getMarketQuotes,
  },
}));

import { McpPortfolioReadToolsController } from "@/backend/controllers/mcp-portfolio-read-tools.controller";

describe("McpPortfolioReadToolsController", () => {
  const controller = new McpPortfolioReadToolsController();
  const tools = new Map<string, (...args: never[]) => Promise<unknown>>();
  const schemas = new Map<
    string,
    { inputSchema: { safeParse: (value: unknown) => { success: boolean } } }
  >();

  beforeEach(() => {
    vi.clearAllMocks();
    tools.clear();
    schemas.clear();
    mocks.registerTool.mockImplementation(
      (
        name: string,
        schema: unknown,
        handler: (...args: never[]) => Promise<unknown>,
      ) => {
        tools.set(name, handler);
        schemas.set(
          name,
          schema as {
            inputSchema: {
              safeParse: (value: unknown) => { success: boolean };
            };
          },
        );
      },
    );
  });

  it("registers only read-only own-account tools and forwards trusted ownership", async () => {
    mocks.getMyPortfolio.mockResolvedValue({ positionCount: 0, movements: [] });
    mocks.listMyManualPositions.mockResolvedValue([]);
    mocks.getMyEmergencyReserve.mockResolvedValue({
      status: "not_configured",
      monthlyExpenses: null,
      targetMonths: null,
      selectedValue: 0,
    });
    mocks.getMyObjectives.mockResolvedValue({ objectives: [] });
    mocks.getMyLongTermStrategy.mockResolvedValue({ allocationActive: false });
    mocks.getMyPortfolioAllocation.mockResolvedValue({ positionCount: 0 });
    mocks.getMyMonthlyPortfolioReview.mockResolvedValue({
      status: "no_history",
    });
    mocks.getMyOperations.mockResolvedValue({ operationCount: 0 });
    mocks.simulateMyObjectiveProjection.mockResolvedValue({
      projectedNominalAmount: 1000,
    });
    mocks.getMarketQuotes.mockResolvedValue({ results: [] });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-1",
      "req-1",
    );

    const portfolio = await tools.get("get_my_portfolio")?.();
    const manualPositions = await tools.get("list_my_manual_positions")?.();
    const reserve = await tools.get("get_my_emergency_reserve")?.();
    const objectives = await tools.get("get_my_objectives")?.();
    const strategy = await tools.get("get_my_long_term_strategy")?.();
    const allocation = await tools.get("get_my_portfolio_allocation")?.();
    const monthlyReview = await tools.get(
      "get_my_monthly_portfolio_review",
    )?.();
    const operations = await tools.get(
      "get_my_operations_and_reconciliation",
    )?.();
    const projectionInput = {
      mode: "project_balance",
      startingAmount: 0,
      monthlyContribution: 100,
      horizonYears: 1,
      annualReturnPercent: 5,
      annualInflationPercent: 3,
      adjustContributionsForInflation: false,
    };
    const projection = await tools.get("simulate_objective_projection")?.(
      projectionInput as never,
    );
    const marketQuotes = await tools.get("get_b3_market_quotes")?.({
      tickers: ["ABCD3", "ABCD4"],
    } as never);

    expect([...tools.keys()]).toEqual([
      "get_my_portfolio",
      "list_my_manual_positions",
      "get_my_emergency_reserve",
      "get_my_objectives",
      "get_my_long_term_strategy",
      "get_my_portfolio_allocation",
      "get_my_monthly_portfolio_review",
      "get_my_operations_and_reconciliation",
      "simulate_objective_projection",
      "get_b3_market_quotes",
    ]);
    expect(mocks.getMyPortfolio).toHaveBeenCalledWith("owner-1", "req-1");
    expect(mocks.listMyManualPositions).toHaveBeenCalledWith(
      "owner-1",
      "req-1",
    );
    expect(mocks.getMyEmergencyReserve).toHaveBeenCalledWith(
      "owner-1",
      "req-1",
    );
    expect(mocks.getMyObjectives).toHaveBeenCalledWith("owner-1", "req-1");
    expect(mocks.getMyLongTermStrategy).toHaveBeenCalledWith(
      "owner-1",
      "req-1",
    );
    expect(mocks.getMyPortfolioAllocation).toHaveBeenCalledWith(
      "owner-1",
      "req-1",
    );
    expect(mocks.getMyMonthlyPortfolioReview).toHaveBeenCalledWith(
      "owner-1",
      undefined,
      "req-1",
    );
    expect(mocks.getMyOperations).toHaveBeenCalledWith("owner-1", "req-1");
    expect(mocks.simulateMyObjectiveProjection).toHaveBeenCalledWith(
      "owner-1",
      projectionInput,
    );
    expect(mocks.getMarketQuotes).toHaveBeenCalledWith(
      ["ABCD3", "ABCD4"],
      "req-1",
    );
    expect(portfolio).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ positionCount: 0, movements: [] }),
        },
      ],
    });
    expect(manualPositions).toEqual({
      content: [{ type: "text", text: "[]" }],
    });
    expect(reserve).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "not_configured",
            monthlyExpenses: null,
            targetMonths: null,
            selectedValue: 0,
          }),
        },
      ],
    });
    expect(objectives).toEqual({
      content: [{ type: "text", text: JSON.stringify({ objectives: [] }) }],
    });
    expect(strategy).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ allocationActive: false }) },
      ],
    });
    expect(allocation).toEqual({
      content: [{ type: "text", text: JSON.stringify({ positionCount: 0 }) }],
    });
    expect(monthlyReview).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ status: "no_history" }) },
      ],
    });
    expect(operations).toEqual({
      content: [{ type: "text", text: JSON.stringify({ operationCount: 0 }) }],
    });
    expect(projection).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ projectedNominalAmount: 1000 }),
        },
      ],
    });
    expect(marketQuotes).toEqual({
      content: [{ type: "text", text: JSON.stringify({ results: [] }) }],
    });
    const marketSchema = schemas.get("get_b3_market_quotes");
    expect(
      marketSchema?.inputSchema.safeParse({ tickers: ["ABCD3"] }).success,
    ).toBe(true);
    expect(
      marketSchema?.inputSchema.safeParse({
        tickers: Array(11).fill("ABCD3"),
      }).success,
    ).toBe(false);
    expect(
      marketSchema?.inputSchema.safeParse({ tickers: ["INVALID"] }).success,
    ).toBe(false);
  });

  it("maps service failures to a safe MCP error", async () => {
    mocks.getMyPortfolio.mockRejectedValue(new Error("private db detail"));
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-1",
      "req-2",
    );

    const result = await tools.get("get_my_portfolio")?.();

    expect(result).toMatchObject({
      isError: true,
      content: [{ text: "Não foi possível concluir a operação no InvestLab." }],
    });
  });

  it("serializes manual positions and maps manual-position service failures", async () => {
    mocks.listMyManualPositions.mockResolvedValue([
      { id: "manual-1", ticker: "VOO" },
    ]);
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-2",
      "req-3",
    );
    await expect(tools.get("list_my_manual_positions")?.()).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify([{ id: "manual-1", ticker: "VOO" }]),
        },
      ],
    });

    mocks.listMyManualPositions.mockRejectedValue(
      new Error("private db detail"),
    );
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-2",
      "req-4",
    );
    await expect(
      tools.get("list_my_manual_positions")?.(),
    ).resolves.toMatchObject({
      isError: true,
      content: [{ text: "Não foi possível concluir a operação no InvestLab." }],
    });
  });

  it("maps emergency reserve lookup failures to a safe MCP error", async () => {
    mocks.getMyEmergencyReserve.mockRejectedValue(
      new Error("private reserve database detail"),
    );
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-3",
      "req-5",
    );

    await expect(
      tools.get("get_my_emergency_reserve")?.(),
    ).resolves.toMatchObject({
      isError: true,
      content: [{ text: "Não foi possível concluir a operação no InvestLab." }],
    });
  });

  it("accepts an optional month for monthly review and maps failures safely", async () => {
    mocks.getMyMonthlyPortfolioReview.mockResolvedValue({
      selectedPeriod: "2026-08",
      status: "partial",
    });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-4",
      "req-6",
    );

    await expect(
      tools.get("get_my_monthly_portfolio_review")?.({
        period: "2026-08",
      } as never),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            selectedPeriod: "2026-08",
            status: "partial",
          }),
        },
      ],
    });
    expect(mocks.getMyMonthlyPortfolioReview).toHaveBeenCalledWith(
      "owner-4",
      "2026-08",
      "req-6",
    );

    mocks.getMyMonthlyPortfolioReview.mockRejectedValue(
      new Error("private detail"),
    );
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-4",
      "req-7",
    );
    await expect(
      tools.get("get_my_monthly_portfolio_review")?.({
        period: "2026-08",
      } as never),
    ).resolves.toMatchObject({
      isError: true,
      content: [{ text: "Não foi possível concluir a operação no InvestLab." }],
    });
  });
});
