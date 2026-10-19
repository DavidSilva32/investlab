import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listManualPositions: vi.fn(),
  runWithDataOwner: vi.fn((userId: string, operation: () => unknown) => {
    mocks.runWithDataOwnerCall(userId);
    return operation();
  }),
  runWithDataOwnerCall: vi.fn(),
}));

vi.mock("@/backend/services/portfolio.service", () => ({
  portfolioService: { getOverview: mocks.getOverview },
}));
vi.mock("@/backend/services/manual-portfolio-position.service", () => ({
  manualPortfolioPositionService: {
    list: mocks.listManualPositions,
  },
}));
vi.mock("@/infrastructure/auth/data-owner-context", () => ({
  runWithDataOwner: mocks.runWithDataOwner,
}));

import { McpPortfolioToolsService } from "@/backend/services/mcp-portfolio-tools.service";

describe("McpPortfolioToolsService read tools", () => {
  const service = new McpPortfolioToolsService();

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("lists manual positions under the same authenticated owner", async () => {
    const positions = [{ id: "position-1" }];
    mocks.listManualPositions.mockResolvedValue(positions);

    await expect(
      service.listMyManualPositions("owner-from-sub", "req-2"),
    ).resolves.toBe(positions);
    expect(mocks.runWithDataOwnerCall).toHaveBeenCalledWith("owner-from-sub");
    expect(mocks.listManualPositions).toHaveBeenCalledWith("req-2");
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
