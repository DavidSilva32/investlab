import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  getMyPortfolio: vi.fn(),
  listMyManualPositions: vi.fn(),
}));

vi.mock("@/backend/services/mcp-portfolio-tools.service", () => ({
  mcpPortfolioToolsService: {
    getMyPortfolio: mocks.getMyPortfolio,
    listMyManualPositions: mocks.listMyManualPositions,
  },
}));

import { McpPortfolioReadToolsController } from "@/backend/controllers/mcp-portfolio-read-tools.controller";

describe("McpPortfolioReadToolsController", () => {
  const controller = new McpPortfolioReadToolsController();
  const tools = new Map<string, (...args: never[]) => Promise<unknown>>();

  beforeEach(() => {
    vi.clearAllMocks();
    tools.clear();
    mocks.registerTool.mockImplementation(
      (
        name: string,
        _schema: unknown,
        handler: (...args: never[]) => Promise<unknown>,
      ) => {
        tools.set(name, handler);
      },
    );
  });

  it("registers only read-only own-account tools and forwards trusted ownership", async () => {
    mocks.getMyPortfolio.mockResolvedValue({ positionCount: 0, movements: [] });
    mocks.listMyManualPositions.mockResolvedValue([]);
    controller.register(
      { registerTool: mocks.registerTool } as never,
      "owner-1",
      "req-1",
    );

    const portfolio = await tools.get("get_my_portfolio")?.();
    const manualPositions = await tools.get("list_my_manual_positions")?.();

    expect([...tools.keys()]).toEqual([
      "get_my_portfolio",
      "list_my_manual_positions",
    ]);
    expect(mocks.getMyPortfolio).toHaveBeenCalledWith("owner-1", "req-1");
    expect(mocks.listMyManualPositions).toHaveBeenCalledWith(
      "owner-1",
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
});
