import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  createMcpHandler: vi.fn(),
  resolvePrincipal: vi.fn(),
}));

vi.mock("@modelcontextprotocol/server", () => ({
  McpServer: class {
    registerTool = mocks.registerTool;
  },
  createMcpHandler: mocks.createMcpHandler,
}));
vi.mock("@/backend/services/mcp-authentication.service", () => ({
  mcpAuthenticationService: { resolvePrincipal: mocks.resolvePrincipal },
}));
vi.mock("@/backend/services/mcp-portfolio-tools.service", () => ({
  mcpPortfolioToolsService: {
    getMyPortfolio: vi.fn(),
    listMyManualPositions: vi.fn(),
    getMyEmergencyReserve: vi.fn(),
    getMyObjectives: vi.fn(),
    getMyLongTermStrategy: vi.fn(),
    getMyPortfolioAllocation: vi.fn(),
    getMyMonthlyPortfolioReview: vi.fn(),
  },
}));

import { McpController } from "@/backend/controllers/mcp.controller";

describe("McpController tool exposure", () => {
  const controller = new McpController();
  let toolNames: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    toolNames = [];
    mocks.registerTool.mockImplementation((name: string) =>
      toolNames.push(name),
    );
    mocks.resolvePrincipal.mockResolvedValue({
      userId: "trusted-user",
      role: "USER",
    });
    mocks.createMcpHandler.mockImplementation((factory: () => unknown) => {
      factory();
      return { fetch: async () => new Response(null, { status: 202 }) };
    });
  });

  async function handle(
    scope: unknown,
    role: "USER" | "ADMIN" = "USER",
    scp?: unknown,
  ) {
    mocks.resolvePrincipal.mockResolvedValueOnce({
      userId: "trusted-user",
      role,
    });
    return controller.handle(
      new Request("https://investlab.example/api/mcp", { method: "POST" }),
      { sub: "trusted-user", scope, scp },
    );
  }

  it("exposes only own-account read tools", async () => {
    await handle("openid mcp:read");

    expect(toolNames).toEqual([
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
  });

  it("keeps administrative tools separate from ordinary and read-only connections", async () => {
    await handle("openid mcp:read mcp:admin:read", "USER");
    expect(toolNames).not.toContain("admin_search_users");

    toolNames = [];
    await handle("openid mcp:read mcp:admin:read", "ADMIN");
    expect(toolNames).toContain("admin_list_users");
    expect(toolNames).toContain("admin_search_users");
    expect(toolNames).toContain("admin_get_user_portfolio");
    expect(toolNames).toContain("admin_get_user_financial_snapshot");

    toolNames = [];
    await handle("openid mcp:read", "ADMIN");
    expect(toolNames).not.toContain("admin_search_users");
    expect(toolNames).not.toContain("admin_get_user_portfolio");
  });

  it("accepts string-array and scp fallback claims while ignoring invalid scope values", async () => {
    await handle(["mcp:read", 5], "USER");
    expect(toolNames).toEqual([
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

    toolNames = [];
    await handle(null, "ADMIN", "mcp:read mcp:admin:read");
    expect(toolNames).toContain("admin_list_users");

    toolNames = [];
    await handle({ unexpected: true }, "ADMIN", ["mcp:admin:read", false]);
    expect(toolNames).not.toContain("admin_list_users");
  });
});
