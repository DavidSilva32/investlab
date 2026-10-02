import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock(
  "@/backend/controllers/personal-investment-strategy.controller",
  () => ({
    personalInvestmentStrategyController: controller,
  }),
);

import { ApplicationError } from "@/backend/errors/application-error";
import { GET, POST } from "@/app/api/portfolio/strategy/route";

describe("personal investment strategy route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the loaded strategy snapshot", async () => {
    controller.get.mockResolvedValue(
      Response.json({ valuationDate: "2026-10-02" }),
    );
    const response = await GET(
      new Request("http://localhost/api/portfolio/strategy", {
        headers: { "x-request-id": "req-get" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      valuationDate: "2026-10-02",
    });
    expect(controller.get).toHaveBeenCalledWith("req-get");
  });

  it("returns generic read errors and client-safe application errors", async () => {
    controller.get.mockRejectedValueOnce(new Error("private failure"));
    const unexpected = await GET(
      new Request("http://localhost/api/portfolio/strategy"),
    );
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      message: "Não foi possível carregar a estratégia.",
    });
    controller.get.mockRejectedValueOnce(
      new ApplicationError("Dados inválidos.", 409),
    );
    const expected = await GET(
      new Request("http://localhost/api/portfolio/strategy"),
    );
    expect(expected.status).toBe(409);
    await expect(expected.json()).resolves.toEqual({
      message: "Dados inválidos.",
    });
  });

  it("passes the request body to save and returns its result", async () => {
    controller.save.mockResolvedValue(Response.json({ message: "Salvo." }));
    const body = {
      answers: { horizonYears: 4, internationalInterest: "unsure" },
      selectedDirection: "review_horizon",
    };
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-post",
        },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(200);
    expect(controller.save).toHaveBeenCalledWith(body, "req-post");
  });

  it("uses a generic client message for unexpected save errors", async () => {
    controller.save.mockRejectedValueOnce(new Error("private failure"));
    const response = await POST(
      new Request("http://localhost/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.message).not.toContain("private failure");
  });

  it("returns 400 for malformed request JSON and preserves failed write errors", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/portfolio/strategy", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      message: "O corpo da requisição não é um JSON válido.",
    });
    expect(controller.save).not.toHaveBeenCalled();
    controller.save.mockRejectedValueOnce(
      new ApplicationError("Escolha uma direção.", 400),
    );
    const expected = await POST(
      new Request("http://localhost/api/portfolio/strategy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(expected.status).toBe(400);
    await expect(expected.json()).resolves.toEqual({
      message: "Escolha uma direção.",
    });
  });
});
