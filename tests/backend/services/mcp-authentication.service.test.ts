import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  hasAcceptedCurrentTerms: vi.fn(),
}));

vi.mock("@/infrastructure/database/client", () => ({
  getDatabaseClient: () => ({ select: mocks.select }),
}));
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: {
    hasAcceptedCurrentTerms: mocks.hasAcceptedCurrentTerms,
  },
}));

import { McpAuthenticationService } from "@/backend/services/mcp-authentication.service";

describe("McpAuthenticationService", () => {
  const service = new McpAuthenticationService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ limit: mocks.limit });
    mocks.limit.mockResolvedValue([
      { id: "user-1", role: "USER", status: "ACTIVE" },
    ]);
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(true);
  });

  it.each([undefined, null, "", 42])(
    "rejects invalid OAuth subject %s without querying a tenant",
    async (subject) => {
      await expect(service.resolvePrincipal(subject)).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );

  it("uses only the token subject and blocks missing or inactive accounts", async () => {
    mocks.limit.mockResolvedValueOnce([]);
    await expect(
      service.resolvePrincipal("missing-user"),
    ).rejects.toMatchObject({
      statusCode: 401,
    });

    mocks.limit.mockResolvedValueOnce([
      { id: "disabled-user", role: "USER", status: "DISABLED" },
    ]);
    await expect(
      service.resolvePrincipal("disabled-user"),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mocks.hasAcceptedCurrentTerms).not.toHaveBeenCalled();
  });

  it("rejects unsupported roles and accounts without current terms acceptance", async () => {
    mocks.limit.mockResolvedValueOnce([
      { id: "user-1", role: "SUPPORT", status: "ACTIVE" },
    ]);
    await expect(service.resolvePrincipal("user-1")).rejects.toMatchObject({
      statusCode: 401,
    });

    mocks.hasAcceptedCurrentTerms.mockResolvedValueOnce(false);
    await expect(service.resolvePrincipal("user-1")).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.hasAcceptedCurrentTerms).toHaveBeenCalledWith("user-1");
  });

  it.each(["USER", "ADMIN"] as const)(
    "returns trusted account identity for an active %s after terms acceptance",
    async (role) => {
      mocks.limit.mockResolvedValueOnce([
        { id: "db-user-id", role, status: "ACTIVE" },
      ]);
      await expect(service.resolvePrincipal("db-user-id")).resolves.toEqual({
        userId: "db-user-id",
        role,
      });
      expect(mocks.hasAcceptedCurrentTerms).toHaveBeenCalledWith("db-user-id");
    },
  );
});
