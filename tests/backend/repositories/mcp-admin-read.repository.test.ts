import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  countWhere: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => ({ select: mocks.select }),
}));

import { McpAdminReadRepository } from "@/backend/repositories/mcp-admin-read.repository";

describe("McpAdminReadRepository", () => {
  const repository = new McpAdminReadRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select
      .mockReturnValueOnce({
        from: () => ({ where: mocks.countWhere }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: mocks.orderBy,
            limit: mocks.limit,
          }),
        }),
      });
    mocks.countWhere.mockResolvedValue([{ total: 23 }]);
    mocks.orderBy.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockReturnValue({ offset: mocks.offset });
    mocks.offset.mockResolvedValue([{ id: "user-1", name: "Ana" }]);
  });

  it("escapes wildcard search text and applies bounded pagination", async () => {
    await expect(repository.searchUsers(" Ana_% ", 3, 10)).resolves.toEqual({
      users: [{ id: "user-1", name: "Ana" }],
      total: 23,
      page: 3,
      pageSize: 10,
    });
    expect(mocks.countWhere).toHaveBeenCalledOnce();
    expect(mocks.orderBy).toHaveBeenCalledOnce();
    expect(mocks.limit).toHaveBeenCalledWith(10);
    expect(mocks.offset).toHaveBeenCalledWith(20);
  });

  it("lists accounts in stable order with a small offset page", async () => {
    mocks.select.mockReset();
    mocks.select
      .mockReturnValueOnce({
        from: () => Promise.resolve([{ total: 51 }]),
      })
      .mockReturnValueOnce({ from: () => ({ orderBy: mocks.orderBy }) });
    mocks.offset.mockResolvedValue([{ id: "user-11", name: "Nina" }]);

    await expect(repository.listUsers(2, 10)).resolves.toEqual({
      users: [{ id: "user-11", name: "Nina" }],
      total: 51,
      page: 2,
      pageSize: 10,
    });
    expect(mocks.limit).toHaveBeenCalledWith(10);
    expect(mocks.offset).toHaveBeenCalledWith(10);
  });

  it("returns only basic account fields for an explicit target lookup", async () => {
    const row = {
      id: "target-1",
      name: "Target",
      email: "target@example.test",
    };
    mocks.select.mockReset();
    mocks.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: vi.fn().mockResolvedValue([row]) }),
      }),
    });

    await expect(repository.findUser("target-1")).resolves.toEqual(row);
  });

  it("returns null when the requested account does not exist", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    mocks.select.mockReset().mockReturnValueOnce({
      from: () => ({ where: () => ({ limit }) }),
    });

    await expect(repository.findUser("missing-user")).resolves.toBeNull();
    expect(limit).toHaveBeenCalledWith(1);
  });
});
