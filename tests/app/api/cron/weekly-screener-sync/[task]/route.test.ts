import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/backend/controllers/screener-sync.controller", () => ({
  screenerSyncController: { sync: mocks.sync },
}));
vi.mock("@/backend/controllers/screener-market.controller", () => ({
  screenerMarketController: { refresh: mocks.refresh },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: {
    error: mocks.error,
    info: vi.fn(),
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));

import { GET } from "@/app/api/cron/weekly-screener-sync/[task]/route";

const secret = "s".repeat(64);
function request(authorization?: string) {
  return new Request(
    "http://localhost/api/cron/weekly-screener-sync/fundamentals",
    {
      headers: {
        "x-request-id": "weekly-sync-test",
        ...(authorization ? { authorization } : {}),
      },
    },
  );
}
function context(task: string) {
  return { params: Promise.resolve({ task }) };
}

describe("GET /api/cron/weekly-screener-sync/[task]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret);
    mocks.sync.mockReset();
    mocks.refresh.mockReset();
    mocks.error.mockReset();
  });

  it("returns unavailable when the cron secret is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(
      request(`Bearer ${secret}`),
      context("fundamentals"),
    );
    expect(response.status).toBe(503);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid authorization before running a task", async () => {
    const response = await GET(request(), context("fundamentals"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      message: "Não autorizado.",
    });
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it("rejects unsupported task names", async () => {
    const response = await GET(request(`Bearer ${secret}`), context("all"));
    expect(response.status).toBe(404);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("runs fundamentals and drains market batches until complete", async () => {
    mocks.sync.mockResolvedValue({ issuers: 3, securities: 5, facts: 8 });
    const fundamentals = await GET(
      request(`Bearer ${secret}`),
      context("fundamentals"),
    );
    expect(fundamentals.status).toBe(200);
    await expect(fundamentals.json()).resolves.toMatchObject({
      issuers: 3,
      requestId: "weekly-sync-test",
    });
    expect(mocks.sync).toHaveBeenCalledOnce();

    mocks.refresh
      .mockResolvedValueOnce({
        totalStaleIssuers: 5,
        attemptedIssuers: 3,
        updatedIssuers: 3,
        unavailableIssuers: 0,
        remainingIssuers: 2,
        completedAt: "2026-10-16T12:00:00.000Z",
      })
      .mockResolvedValueOnce({
        totalStaleIssuers: 5,
        attemptedIssuers: 2,
        updatedIssuers: 2,
        unavailableIssuers: 0,
        remainingIssuers: 0,
        completedAt: "2026-10-16T12:01:00.000Z",
      });
    const market = await GET(request(`Bearer ${secret}`), context("market"));
    expect(market.status).toBe(200);
    await expect(market.json()).resolves.toMatchObject({
      batchCount: 2,
      totalStaleIssuers: 5,
      attemptedIssuers: 5,
      updatedIssuers: 5,
      remainingIssuers: 0,
      requestId: "weekly-sync-test",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledWith("weekly-sync-test");
  });

  it("stops when a market batch makes no progress", async () => {
    mocks.refresh.mockResolvedValue({
      totalStaleIssuers: 2,
      attemptedIssuers: 0,
      updatedIssuers: 0,
      unavailableIssuers: 0,
      remainingIssuers: 2,
      completedAt: null,
    });
    const response = await GET(request(`Bearer ${secret}`), context("market"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message:
        "A atualização de mercado não avançou; será retomada na próxima execução.",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("stops before exceeding the Vercel function duration", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(281_000);
    mocks.refresh.mockResolvedValue({
      totalStaleIssuers: 2,
      attemptedIssuers: 1,
      updatedIssuers: 1,
      unavailableIssuers: 0,
      remainingIssuers: 1,
      completedAt: "2026-10-16T12:00:00.000Z",
    });

    const response = await GET(request(`Bearer ${secret}`), context("market"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message:
        "A atualização de mercado excedeu o tempo disponível e continuará na próxima execução.",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("returns safe service failures and does not log internal details", async () => {
    mocks.sync.mockRejectedValueOnce(
      new ApplicationError("A fonte de dados limitou as consultas.", 429),
    );
    const expected = await GET(
      request(`Bearer ${secret}`),
      context("fundamentals"),
    );
    expect(expected.status).toBe(429);
    await expect(expected.json()).resolves.toMatchObject({
      message: "A fonte de dados limitou as consultas.",
    });

    mocks.refresh.mockRejectedValueOnce(new Error("private provider payload"));
    const unexpected = await GET(
      request(`Bearer ${secret}`),
      context("market"),
    );
    expect(unexpected.status).toBe(502);
    const body = await unexpected.json();
    expect(body.message).toBe("A atualização semanal não foi concluída.");
    expect(JSON.stringify(body)).not.toContain("private provider payload");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private provider payload",
    );

    mocks.sync.mockRejectedValueOnce("opaque failure");
    const nonError = await GET(
      request(`Bearer ${secret}`),
      context("fundamentals"),
    );
    expect(nonError.status).toBe(502);
    expect(mocks.error).toHaveBeenLastCalledWith(
      "weekly_screener_sync_route_failed",
      expect.objectContaining({ errorType: "unknown" }),
    );
  });
});
