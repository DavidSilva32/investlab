vi.mock("@/infrastructure/auth/authorization", () => ({
  getAuthenticatedUser: vi.fn(async () => ({ id: "owner-1", role: "ADMIN" })),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const state = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  supportCookie: false,
  supportTarget: null as { targetUserId: string } | null,
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/backend/controllers/stock-manual-valuation.controller", () => ({
  stockManualValuationController: { list: state.list, save: state.save },
}));
vi.mock("@/infrastructure/logging/logger", () => ({
  logger: {
    error: state.error,
    info: state.info,
    withContext: (_context: unknown, operation: () => unknown) => operation(),
  },
}));
vi.mock("@/infrastructure/auth/data-owner-context", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/infrastructure/auth/data-owner-context")
    >();
  return actual;
});
vi.mock("@/backend/services/privacy-center.service", () => ({
  privacyCenterService: { hasAcceptedCurrentTerms: vi.fn(async () => true) },
}));
vi.mock("@/backend/services/admin-support-view.service", () => ({
  ADMIN_SUPPORT_VIEW_COOKIE: "investlab-support-view",
  hasAdminSupportViewCookie: vi.fn(() => state.supportCookie),
  readAdminSupportViewToken: vi.fn(() =>
    state.supportCookie ? "token" : null,
  ),
  adminSupportViewService: {
    getActive: vi.fn(async () => state.supportTarget),
  },
}));

import { GET } from "@/app/api/analyses/stocks/[ticker]/manual-inputs/route";
import { PUT } from "@/app/api/analyses/stocks/[ticker]/manual-inputs/[inputKey]/route";

describe("manual valuation input routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.supportCookie = false;
    state.supportTarget = null;
  });

  it("scopes the read route and returns the controller response", async () => {
    state.list.mockResolvedValue(
      Response.json({ ticker: "ITUB4", inputs: [], requestId: "request-1" }),
    );
    const response = await GET(
      new Request("http://test", { headers: { "x-request-id": "request-1" } }),
      { params: Promise.resolve({ ticker: "ITUB4" }) },
    );
    expect(response.status).toBe(200);
    expect(state.list).toHaveBeenCalledWith("ITUB4", "request-1");
  });

  it("preserves client-safe validation errors on reads", async () => {
    state.list.mockRejectedValue(
      new ApplicationError("O código da ação não é válido.", 400),
    );
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "?" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "O código da ação não é válido.",
    });
  });

  it("returns a generic client-safe error when reading fails unexpectedly", async () => {
    state.list.mockRejectedValue(new Error("database details"));
    const response = await GET(new Request("http://test"), {
      params: Promise.resolve({ ticker: "ITUB4" }),
    });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({
      message: "Não foi possível carregar os dados informados agora.",
    });
  });

  it("accepts owner-scoped updates and safely reports failures", async () => {
    state.save.mockResolvedValue(Response.json({ value: 2 }));
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        body: JSON.stringify({ value: 2 }),
      }),
      {
        params: Promise.resolve({ ticker: "ITUB4", inputKey: "graham_eps" }),
      },
    );
    expect(response.status).toBe(200);
    expect(state.save).toHaveBeenCalledWith(
      "ITUB4",
      "graham_eps",
      expect.any(Request),
      expect.any(String),
    );

    state.save.mockRejectedValueOnce(new Error("database secret"));
    const failed = await PUT(
      new Request("http://test", { method: "PUT", body: "{}" }),
      {
        params: Promise.resolve({ ticker: "ITUB4", inputKey: "graham_eps" }),
      },
    );
    expect(failed.status).toBe(500);
    await expect(failed.json()).resolves.toMatchObject({
      message: "Não foi possível acessar os dados informados agora.",
    });
    expect(state.error).toHaveBeenCalledWith(
      "stock_manual_valuation_request_failed",
      expect.objectContaining({ ticker: "ITUB4", error: expect.any(Error) }),
    );
  });

  it("preserves client-safe validation errors when saving", async () => {
    state.save.mockRejectedValue(
      new ApplicationError("Informe um valor por ação válido.", 400),
    );
    const response = await PUT(
      new Request("http://test", {
        method: "PUT",
        body: JSON.stringify({ value: 2 }),
      }),
      {
        params: Promise.resolve({
          ticker: "ITUB4",
          inputKey: "analysis_ltm_eps",
        }),
      },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: "Informe um valor por ação válido.",
    });
  });

  it("allows support mode to read the target account but blocks saving", async () => {
    state.supportCookie = true;
    state.supportTarget = { targetUserId: "customer-9" };
    state.list.mockImplementation(async () => Response.json({ inputs: [] }));
    const read = await GET(
      new Request("http://test", {
        headers: { cookie: "investlab-support-view=token" },
      }),
      { params: Promise.resolve({ ticker: "ITUB4" }) },
    );
    expect(read.status).toBe(200);
    state.save.mockClear();
    const write = await PUT(
      new Request("http://test", {
        method: "PUT",
        headers: { cookie: "investlab-support-view=token" },
        body: JSON.stringify({ value: 2 }),
      }),
      {
        params: Promise.resolve({ ticker: "ITUB4", inputKey: "graham_eps" }),
      },
    );
    expect(write.status).toBe(403);
    expect(state.save).not.toHaveBeenCalled();
  });
});
