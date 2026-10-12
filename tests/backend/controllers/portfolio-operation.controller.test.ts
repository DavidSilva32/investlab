import { describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/backend/services/portfolio-operation.service", () => ({
  portfolioOperationService: service,
}));

import { PortfolioOperationController } from "@/backend/controllers/portfolio-operation.controller";

describe("PortfolioOperationController", () => {
  it("returns manual operations and B3 candidates", async () => {
    const result = { operations: [], movements: [], candidates: [], links: [] };
    service.list.mockResolvedValue(result);
    await expect(
      (await new PortfolioOperationController().list("r1")).json(),
    ).resolves.toEqual(result);
    expect(service.list).toHaveBeenCalledWith("r1");
  });

  it("parses create JSON and returns the saved operation", async () => {
    const result = { id: "operation-1" };
    service.create.mockResolvedValue(result);
    const idempotencyKey = "58cde392-a188-41a6-88a7-6c2a4927025d";
    const response = await new PortfolioOperationController().create(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ side: "BUY" }),
      }),
      "r1",
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(result);
    expect(service.create).toHaveBeenCalledWith(
      { side: "BUY" },
      idempotencyKey,
      "r1",
    );
  });

  it("rejects malformed manual operation JSON", async () => {
    await expect(
      new PortfolioOperationController().create(
        new Request("http://localhost", {
          method: "POST",
          headers: {
            "Idempotency-Key": "58cde392-a188-41a6-88a7-6c2a4927025d",
          },
          body: "{",
        }),
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires an idempotency key for manual operations", async () => {
    await expect(
      new PortfolioOperationController().create(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ side: "BUY" }),
        }),
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("parses reconciliation and extracts the operation identifier", async () => {
    const result = { id: "event-1" };
    service.reconcile.mockResolvedValue(result);
    const response = await new PortfolioOperationController().reconcile(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          operationId: "op-1",
          movementId: "movement-1",
          action: "LINK",
        }),
      }),
      "r1",
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(result);
    expect(service.reconcile).toHaveBeenCalledWith(
      "op-1",
      { movementId: "movement-1", action: "LINK" },
      "r1",
    );
  });

  it.each([
    "{",
    "[]",
    JSON.stringify({ movementId: "movement-1", action: "LINK" }),
  ])("rejects invalid reconciliation request %s", async (body) => {
    await expect(
      new PortfolioOperationController().reconcile(
        new Request("http://localhost", { method: "POST", body }),
        "r1",
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
