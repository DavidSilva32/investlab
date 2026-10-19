import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  findUser: vi.fn(),
  getMyPortfolio: vi.fn(),
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
  mcpPortfolioToolsService: { getMyPortfolio: mocks.getMyPortfolio },
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
});
