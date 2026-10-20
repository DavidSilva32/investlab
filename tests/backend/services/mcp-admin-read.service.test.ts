import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  findUser: vi.fn(),
  getMyPortfolio: vi.fn(),
  getMyOperations: vi.fn(),
  getMyObjectives: vi.fn(),
  getMyLongTermStrategy: vi.fn(),
  getMyPortfolioAllocation: vi.fn(),
  getMyEmergencyReserve: vi.fn(),
  getMyMonthlyPortfolioReview: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/backend/services/mcp-authentication.service", () => ({
  mcpAuthenticationService: { resolvePrincipal: mocks.resolvePrincipal },
}));
vi.mock("@/backend/repositories/mcp-admin-read.repository", () => ({
  mcpAdminReadRepository: {
    listUsers: mocks.listUsers,
    searchUsers: mocks.searchUsers,
    findUser: mocks.findUser,
  },
}));
vi.mock("@/backend/services/mcp-portfolio-tools.service", () => ({
  mcpPortfolioToolsService: {
    getMyPortfolio: mocks.getMyPortfolio,
    getMyOperations: mocks.getMyOperations,
    getMyObjectives: mocks.getMyObjectives,
    getMyLongTermStrategy: mocks.getMyLongTermStrategy,
    getMyPortfolioAllocation: mocks.getMyPortfolioAllocation,
    getMyEmergencyReserve: mocks.getMyEmergencyReserve,
    getMyMonthlyPortfolioReview: mocks.getMyMonthlyPortfolioReview,
  },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: { info: mocks.info },
}));

import { McpAdminReadService } from "@/backend/services/mcp-admin-read.service";

describe("McpAdminReadService", () => {
  const service = new McpAdminReadService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePrincipal.mockResolvedValue({
      userId: "admin-1",
      role: "ADMIN",
    });
    mocks.searchUsers.mockResolvedValue({
      users: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    mocks.findUser.mockResolvedValue({
      id: "target-1",
      name: "Alvo",
      email: "alvo@example.test",
      role: "USER",
      status: "ACTIVE",
    });
    mocks.getMyPortfolio.mockResolvedValue({ positions: [] });
    mocks.getMyObjectives.mockResolvedValue({ objectives: [] });
    mocks.getMyLongTermStrategy.mockResolvedValue({ strategy: null });
    mocks.getMyPortfolioAllocation.mockResolvedValue({ classDistribution: [] });
    mocks.getMyEmergencyReserve.mockResolvedValue({ status: "not_configured" });
    mocks.getMyMonthlyPortfolioReview.mockResolvedValue({ status: "empty" });
  });

  it("requires separate admin scope and rechecks role on each search", async () => {
    await expect(
      service.searchUsers("admin-1", ["mcp:read"], "ana", 1, 20, "req-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.resolvePrincipal).not.toHaveBeenCalled();

    mocks.resolvePrincipal.mockResolvedValueOnce({
      userId: "user-1",
      role: "USER",
    });
    await expect(
      service.searchUsers("user-1", ["mcp:admin:read"], "ana", 1, 20, "req-2"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.searchUsers).not.toHaveBeenCalled();
  });

  it("requires a filtered, bounded page and logs actor metadata only", async () => {
    await expect(
      service.searchUsers("admin-1", ["mcp:admin:read"], "a", 1, 20, "req-3"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.searchUsers).not.toHaveBeenCalled();

    const results = await service.searchUsers(
      "admin-1",
      ["mcp:admin:read"],
      " ana ",
      2,
      10,
      "req-4",
    );
    expect(results).toEqual({ users: [], total: 0, page: 1, pageSize: 20 });
    expect(mocks.searchUsers).toHaveBeenCalledWith("ana", 2, 10);
    expect(mocks.info).toHaveBeenCalledWith("mcp_admin_user_search", {
      actorUserId: "admin-1",
      requestId: "req-4",
      page: 2,
      pageSize: 10,
      queryLength: 3,
    });
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain("ana");
  });

  it("rejects oversized search terms and invalid pagination before querying", async () => {
    await expect(
      service.searchUsers(
        "admin-1",
        ["mcp:admin:read"],
        "x".repeat(121),
        1,
        20,
        "req-long",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.searchUsers(
        "admin-1",
        ["mcp:admin:read"],
        "ana",
        1,
        51,
        "req-size",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      service.listUsers("admin-1", ["mcp:admin:read"], 50_001, 20, "req-page"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.searchUsers).not.toHaveBeenCalled();
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("lists only a bounded page of basic account records for administrators", async () => {
    const page = {
      users: [{ id: "user-1", name: "Pessoa" }],
      total: 71,
      page: 2,
      pageSize: 10,
    };
    mocks.listUsers.mockResolvedValue(page);

    await expect(
      service.listUsers("admin-1", ["mcp:admin:read"], 2, 10, "req-list"),
    ).resolves.toEqual(page);
    expect(mocks.resolvePrincipal).toHaveBeenCalledWith("admin-1");
    expect(mocks.listUsers).toHaveBeenCalledWith(2, 10);
    expect(mocks.info).toHaveBeenCalledWith("mcp_admin_user_list", {
      actorUserId: "admin-1",
      requestId: "req-list",
      page: 2,
      pageSize: 10,
    });
  });

  it("requires an explicit target and logs actor and target before reading data", async () => {
    await expect(
      service.getUserPortfolio("admin-1", ["mcp:admin:read"], "", "req-5"),
    ).rejects.toMatchObject({ statusCode: 400 });

    const result = await service.getUserPortfolio(
      "admin-1",
      ["mcp:admin:read"],
      "target-1",
      "req-6",
    );
    expect(mocks.resolvePrincipal).toHaveBeenLastCalledWith("admin-1");
    expect(mocks.findUser).toHaveBeenCalledWith("target-1");
    expect(mocks.getMyPortfolio).toHaveBeenCalledWith("target-1", "req-6");
    expect(mocks.info).toHaveBeenCalledWith("mcp_admin_user_portfolio_read", {
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestId: "req-6",
    });
    expect(result).toMatchObject({ user: { id: "target-1" } });
    expect(result.portfolio.positions).toEqual([]);
  });

  it("rejects a target account that cannot be found", async () => {
    mocks.findUser.mockResolvedValueOnce(null);

    await expect(
      service.getUserPortfolio(
        "admin-1",
        ["mcp:admin:read"],
        "missing-user",
        "req-missing",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.getMyPortfolio).not.toHaveBeenCalled();
  });

  it("requires admin scope, rechecks the role, and reads bounded operations only for an explicit existing target", async () => {
    await expect(
      service.getUserOperations("admin-1", ["mcp:read"], "target-1", "r1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.resolvePrincipal).not.toHaveBeenCalled();

    mocks.resolvePrincipal.mockResolvedValueOnce({
      userId: "admin-1",
      role: "USER",
    });
    await expect(
      service.getUserOperations(
        "admin-1",
        ["mcp:admin:read"],
        "target-1",
        "r2",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.getMyOperations).not.toHaveBeenCalled();

    await expect(
      service.getUserOperations("admin-1", ["mcp:admin:read"], " ", "r3"),
    ).rejects.toMatchObject({ statusCode: 400 });
    mocks.findUser.mockResolvedValueOnce(null);
    await expect(
      service.getUserOperations("admin-1", ["mcp:admin:read"], "missing", "r4"),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.getMyOperations).not.toHaveBeenCalled();

    const operationWindow = {
      operations: [],
      movements: [],
      recentReconciliationEvents: [],
      hasMore: { operations: false },
    };
    mocks.getMyOperations.mockResolvedValue(operationWindow);
    await expect(
      service.getUserOperations(
        "admin-1",
        ["mcp:admin:read"],
        "target-1",
        "r5",
      ),
    ).resolves.toEqual({
      target: { id: "target-1", name: "Alvo" },
      operations: operationWindow,
    });
    expect(mocks.findUser).toHaveBeenLastCalledWith("target-1");
    expect(mocks.getMyOperations).toHaveBeenCalledWith("target-1", "r5");
    expect(mocks.info).toHaveBeenCalledWith("mcp_admin_user_operations_read", {
      actorUserId: "admin-1",
      targetUserId: "target-1",
      requestId: "r5",
    });
  });

  it("requires admin scope and an explicit existing target for financial snapshots", async () => {
    await expect(
      service.getUserFinancialSnapshot(
        "admin-1",
        ["mcp:read"],
        "target-1",
        undefined,
        "req-scope",
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.getUserFinancialSnapshot(
        "admin-1",
        ["mcp:admin:read"],
        " ",
        undefined,
        "req-empty",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    mocks.findUser.mockResolvedValueOnce(null);
    await expect(
      service.getUserFinancialSnapshot(
        "admin-1",
        ["mcp:admin:read"],
        "missing",
        undefined,
        "req-missing",
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.getMyObjectives).not.toHaveBeenCalled();
  });

  it("combines domain reads only for the explicit target under the admin scope", async () => {
    const result = await service.getUserFinancialSnapshot(
      "admin-1",
      ["mcp:admin:read"],
      "target-1",
      "2026-09",
      "req-snapshot",
    );

    expect(result).toEqual({
      target: { id: "target-1", name: "Alvo" },
      portfolio: { positions: [] },
      objectives: { objectives: [] },
      longTermStrategy: { strategy: null },
      allocation: { classDistribution: [] },
      emergencyReserve: { status: "not_configured" },
      monthlyReview: { status: "empty" },
    });
    expect(mocks.getMyPortfolio).toHaveBeenCalledWith(
      "target-1",
      "req-snapshot",
    );
    expect(mocks.getMyObjectives).toHaveBeenCalledWith(
      "target-1",
      "req-snapshot",
    );
    expect(mocks.getMyLongTermStrategy).toHaveBeenCalledWith(
      "target-1",
      "req-snapshot",
    );
    expect(mocks.getMyPortfolioAllocation).toHaveBeenCalledWith(
      "target-1",
      "req-snapshot",
    );
    expect(mocks.getMyEmergencyReserve).toHaveBeenCalledWith(
      "target-1",
      "req-snapshot",
    );
    expect(mocks.getMyMonthlyPortfolioReview).toHaveBeenCalledWith(
      "target-1",
      "2026-09",
      "req-snapshot",
    );
    expect(mocks.info).toHaveBeenCalledWith(
      "mcp_admin_user_financial_snapshot_read",
      {
        actorUserId: "admin-1",
        targetUserId: "target-1",
        requestId: "req-snapshot",
        period: "2026-09",
      },
    );
  });

  it("reads a financial snapshot without an optional month", async () => {
    const result = await service.getUserFinancialSnapshot(
      "admin-1",
      ["mcp:admin:read"],
      "target-1",
      undefined,
      "req-snapshot-latest",
    );

    expect(result.target).toEqual({ id: "target-1", name: "Alvo" });
    expect(mocks.getMyMonthlyPortfolioReview).toHaveBeenCalledWith(
      "target-1",
      undefined,
      "req-snapshot-latest",
    );
    expect(mocks.info).toHaveBeenCalledWith(
      "mcp_admin_user_financial_snapshot_read",
      {
        actorUserId: "admin-1",
        targetUserId: "target-1",
        requestId: "req-snapshot-latest",
      },
    );
  });

  it("rejects malformed months for administrative financial snapshots", async () => {
    await expect(
      service.getUserFinancialSnapshot(
        "admin-1",
        ["mcp:admin:read"],
        "target-1",
        "2026-13",
        "req-period",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.getMyPortfolio).not.toHaveBeenCalled();
  });
});
