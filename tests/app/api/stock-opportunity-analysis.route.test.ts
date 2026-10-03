import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const controller = vi.hoisted(() => ({
  list: vi.fn(),
  saveInput: vi.fn(),
  saveBazinTargetYield: vi.fn(),
  deleteInput: vi.fn(),
}));
const logger = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/backend/controllers/stock-opportunity-analysis.controller", () => ({
  stockOpportunityAnalysisController: controller,
}));
vi.mock("@/infrastructure/logging/logger", () => ({ logger }));

import { GET, POST } from "@/app/api/analyses/portfolio-opportunities/route";
import { DELETE } from "@/app/api/analyses/portfolio-opportunities/[ticker]/[inputKey]/route";
import { POST as SAVE_YIELD } from "@/app/api/analyses/portfolio-opportunities/settings/route";

describe("stock opportunity collection route", () => {
  it("delegates successful reads and writes with the request id", async () => {
    controller.list.mockResolvedValue(Response.json({ opportunities: [] }));
    const read = await GET(
      new Request("http://test", { headers: { "x-request-id": "req-read" } }),
    );
    expect(read.status).toBe(200);
    expect(controller.list).toHaveBeenCalledWith("req-read");

    const request = new Request("http://test", { method: "POST", body: "{}" });
    controller.saveInput.mockResolvedValue(Response.json({ saved: true }));
    const write = await POST(request);
    expect(write.status).toBe(200);
    expect(controller.saveInput).toHaveBeenCalledWith(
      request,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });

  it("returns safe application and generic failures", async () => {
    controller.list.mockRejectedValue(new ApplicationError("Invalid", 409));
    const expected = await GET(new Request("http://test"));
    expect(expected.status).toBe(409);
    expect(expected.headers.get("x-request-id")).toBeTruthy();
    await expect(expected.json()).resolves.toMatchObject({
      message: "Invalid",
    });

    controller.list.mockRejectedValue(new Error("database secret"));
    const generic = await GET(
      new Request("http://test", { headers: { "x-request-id": "req-fail" } }),
    );
    expect(generic.status).toBe(500);
    expect(generic.headers.get("x-request-id")).toBe("req-fail");
    await expect(generic.json()).resolves.toMatchObject({
      requestId: "req-fail",
      message: "Não foi possível carregar as oportunidades da carteira.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "stock_opportunity_analysis_route_failed",
      expect.objectContaining({
        requestId: "req-fail",
        error: expect.any(Error),
      }),
    );

    controller.saveInput.mockRejectedValue(
      new ApplicationError("Invalid input", 400),
    );
    const postError = await POST(
      new Request("http://test", { method: "POST", body: "{}" }),
    );
    expect(postError.status).toBe(400);
    await expect(postError.json()).resolves.toMatchObject({
      message: "Invalid input",
    });
  });
});

describe("stock opportunity delete route", () => {
  it("delegates deletion using the route params and request id", async () => {
    controller.deleteInput.mockResolvedValue(Response.json({ deleted: true }));
    const response = await DELETE(
      new Request("http://test", { headers: { "x-request-id": "req-delete" } }),
      { params: Promise.resolve({ ticker: "ABCD3", inputKey: "graham_eps" }) },
    );
    expect(response.status).toBe(200);
    expect(controller.deleteInput).toHaveBeenCalledWith(
      "ABCD3",
      "graham_eps",
      "req-delete",
    );
  });

  it("returns safe application and generic deletion failures", async () => {
    const params = {
      params: Promise.resolve({ ticker: "ABCD3", inputKey: "graham_eps" }),
    };
    controller.deleteInput.mockRejectedValue(
      new ApplicationError("Missing", 404),
    );
    const expected = await DELETE(new Request("http://test"), params);
    expect(expected.status).toBe(404);
    await expect(expected.json()).resolves.toMatchObject({
      message: "Missing",
    });

    controller.deleteInput.mockRejectedValue(new Error("database secret"));
    const generic = await DELETE(
      new Request("http://test", {
        headers: { "x-request-id": "req-delete-error" },
      }),
      params,
    );
    expect(generic.status).toBe(500);
    expect(generic.headers.get("x-request-id")).toBe("req-delete-error");
    await expect(generic.json()).resolves.toMatchObject({
      message: "Não foi possível remover a entrada manual.",
    });
    expect(logger.error).toHaveBeenCalledWith(
      "stock_opportunity_manual_input_delete_failed",
      expect.objectContaining({
        requestId: "req-delete-error",
        error: expect.any(Error),
      }),
    );
  });
});

describe("stock opportunity settings route", () => {
  it("delegates successful yield updates", async () => {
    controller.saveBazinTargetYield.mockResolvedValue(
      Response.json({ bazinTargetYield: 7.25 }),
    );
    const request = new Request("http://test", { method: "POST", body: "{}" });
    const response = await SAVE_YIELD(request);
    expect(response.status).toBe(200);
    expect(controller.saveBazinTargetYield).toHaveBeenCalledWith(
      request,
      expect.stringMatching(/^[0-9a-f-]{36}$/i),
    );
  });

  it("returns application and generic yield update failures safely", async () => {
    controller.saveBazinTargetYield.mockRejectedValue(
      new ApplicationError("Invalid rate", 400),
    );
    const expected = await SAVE_YIELD(
      new Request("http://test", { method: "POST" }),
    );
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toMatchObject({
      message: "Invalid rate",
    });

    controller.saveBazinTargetYield.mockRejectedValue(
      new Error("database secret"),
    );
    const generic = await SAVE_YIELD(
      new Request("http://test", {
        method: "POST",
        headers: { "x-request-id": "req-yield-error" },
      }),
    );
    expect(generic.status).toBe(500);
    expect(generic.headers.get("x-request-id")).toBe("req-yield-error");
    await expect(generic.json()).resolves.toMatchObject({
      message: "Não foi possível atualizar a taxa configurada.",
    });
  });
});
