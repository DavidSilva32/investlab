import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  getUserPortfolio: vi.fn(),
  getUserOperations: vi.fn(),
  getUserFinancialSnapshot: vi.fn(),
}));

vi.mock("@/backend/services/mcp-admin-read.service", () => ({
  mcpAdminReadService: {
    listUsers: mocks.listUsers,
    searchUsers: mocks.searchUsers,
    getUserPortfolio: mocks.getUserPortfolio,
    getUserOperations: mocks.getUserOperations,
    getUserFinancialSnapshot: mocks.getUserFinancialSnapshot,
  },
}));

import { McpAdminReadToolsController } from "@/backend/controllers/mcp-admin-read-tools.controller";

describe("McpAdminReadToolsController", () => {
  const controller = new McpAdminReadToolsController();
  const tools = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const schemas = new Map<
    string,
    { inputSchema: { parse: (value: unknown) => unknown } }
  >();

  beforeEach(() => {
    vi.clearAllMocks();
    tools.clear();
    schemas.clear();
    mocks.registerTool.mockImplementation(
      (
        name: string,
        schema: { inputSchema: { parse: (value: unknown) => unknown } },
        handler: (...args: unknown[]) => Promise<unknown>,
      ) => {
        tools.set(name, handler);
        schemas.set(name, schema);
      },
    );
  });

  it("registers only specific admin read tools with bounded search schema", () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-1",
    );

    expect([...tools.keys()]).toEqual([
      "admin_list_users",
      "admin_search_users",
      "admin_get_user_portfolio",
      "admin_get_user_operations",
      "admin_get_user_financial_snapshot",
    ]);
  });

  it("passes an explicit target id and trusted actor to the service", async () => {
    mocks.getUserPortfolio.mockResolvedValue({ user: { id: "target-1" } });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-2",
    );

    const handler = tools.get("admin_get_user_portfolio");
    await handler?.({ targetUserId: "target-1" } as never);

    expect(mocks.getUserPortfolio).toHaveBeenCalledWith(
      "admin-1",
      ["mcp:admin:read"],
      "target-1",
      "req-2",
    );
  });

  it("passes an explicit target id to the admin operations tool", async () => {
    mocks.getUserOperations.mockResolvedValue({
      target: { id: "target-1" },
      operations: { returnedCounts: { operations: 0 } },
    });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-operations",
    );

    await expect(
      tools.get("admin_get_user_operations")?.({
        targetUserId: "target-1",
      }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            target: { id: "target-1" },
            operations: { returnedCounts: { operations: 0 } },
          }),
        },
      ],
    });
    expect(mocks.getUserOperations).toHaveBeenCalledWith(
      "admin-1",
      ["mcp:admin:read"],
      "target-1",
      "req-operations",
    );
  });

  it("validates bounded list, search, and explicit target inputs", () => {
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-schema",
    );

    expect(schemas.get("admin_list_users")?.inputSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      schemas.get("admin_list_users")?.inputSchema.parse({ page: 0 }),
    ).toThrow();
    expect(() =>
      schemas
        .get("admin_search_users")
        ?.inputSchema.parse({ query: "a", pageSize: 51 }),
    ).toThrow();
    expect(
      schemas.get("admin_search_users")?.inputSchema.parse({ query: " Ana " }),
    ).toEqual({
      query: "Ana",
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      schemas
        .get("admin_get_user_portfolio")
        ?.inputSchema.parse({ targetUserId: " " }),
    ).toThrow();
    expect(() =>
      schemas
        .get("admin_get_user_operations")
        ?.inputSchema.parse({ targetUserId: " " }),
    ).toThrow();
    expect(
      schemas
        .get("admin_get_user_operations")
        ?.inputSchema.parse({ targetUserId: "target-1" }),
    ).toEqual({ targetUserId: "target-1" });
    expect(
      schemas
        .get("admin_get_user_financial_snapshot")
        ?.inputSchema.parse({ targetUserId: "target-1", period: "2026-10" }),
    ).toEqual({ targetUserId: "target-1", period: "2026-10" });
    expect(() =>
      schemas
        .get("admin_get_user_financial_snapshot")
        ?.inputSchema.parse({ targetUserId: "target-1", period: "2026-13" }),
    ).toThrow();
  });

  it("returns serialized account-list and search results", async () => {
    mocks.listUsers.mockResolvedValue({ users: [{ id: "u1" }], total: 1 });
    mocks.searchUsers.mockResolvedValue({ users: [{ id: "u2" }], total: 1 });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-list-search",
    );

    await expect(
      tools.get("admin_list_users")?.({ page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ users: [{ id: "u1" }], total: 1 }),
        },
      ],
    });
    await expect(
      tools.get("admin_search_users")?.({
        query: "ana",
        page: 2,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ users: [{ id: "u2" }], total: 1 }),
        },
      ],
    });
    expect(mocks.listUsers).toHaveBeenCalledWith(
      "admin-1",
      ["mcp:admin:read"],
      1,
      20,
      "req-list-search",
    );
    expect(mocks.searchUsers).toHaveBeenCalledWith(
      "admin-1",
      ["mcp:admin:read"],
      "ana",
      2,
      10,
      "req-list-search",
    );
  });

  it("passes explicit target and optional period to the snapshot service", async () => {
    mocks.getUserFinancialSnapshot.mockResolvedValue({ target: { id: "u1" } });
    controller.register(
      { registerTool: mocks.registerTool } as never,
      { sub: "admin-1", scope: ["mcp:admin:read"] },
      "req-snapshot",
    );

    await expect(
      tools.get("admin_get_user_financial_snapshot")?.({
        targetUserId: "u1",
        period: "2026-09",
      }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ target: { id: "u1" } }),
        },
      ],
    });
    expect(mocks.getUserFinancialSnapshot).toHaveBeenCalledWith(
      "admin-1",
      ["mcp:admin:read"],
      "u1",
      "2026-09",
      "req-snapshot",
    );
  });

  it.each([
    ["admin_list_users", "listUsers"],
    ["admin_search_users", "searchUsers"],
    ["admin_get_user_portfolio", "getUserPortfolio"],
    ["admin_get_user_operations", "getUserOperations"],
    ["admin_get_user_financial_snapshot", "getUserFinancialSnapshot"],
  ] as const)(
    "maps %s failures to safe MCP errors",
    async (toolName, serviceMethod) => {
      mocks[serviceMethod].mockRejectedValue(
        new Error("private database detail"),
      );
      controller.register(
        { registerTool: mocks.registerTool } as never,
        { sub: "admin-1", scope: ["mcp:admin:read"] },
        "req-error",
      );
      const args =
        toolName === "admin_list_users"
          ? { page: 1, pageSize: 20 }
          : toolName === "admin_search_users"
            ? { query: "ana", page: 1, pageSize: 20 }
            : { targetUserId: "target-1" };

      const result = await tools.get(toolName)?.(args);
      expect(result).toMatchObject({
        isError: true,
        content: [
          { text: "Não foi possível concluir a operação no InvestLab." },
        ],
      });
    },
  );
});
