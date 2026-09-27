import { beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@/backend/services/manual-portfolio-position.service", () => ({
  manualPortfolioPositionService: service,
}));

import { ManualPortfolioPositionController } from "@/backend/controllers/manual-portfolio-position.controller";

const validId = "0fefb48f-b6d9-4b8e-890d-95fe4fe7b305";
const request = (body: string) =>
  new Request("http://localhost/api/positions/manual", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });

describe("ManualPortfolioPositionController", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists positions and creates a position with request context", async () => {
    service.list.mockResolvedValue([{ id: validId }]);
    service.create.mockResolvedValue({ id: validId });
    const controller = new ManualPortfolioPositionController();
    const listResponse = await controller.list("req");
    expect(await listResponse.json()).toEqual({ positions: [{ id: validId }] });
    expect(service.list).toHaveBeenCalledWith("req");
    const createdResponse = await controller.create(
      request('{"product":"ETF"}'),
      "req",
    );
    expect(createdResponse.status).toBe(201);
    expect(await createdResponse.json()).toEqual({ position: { id: validId } });
    expect(service.create).toHaveBeenCalledWith({ product: "ETF" }, "req");
  });

  it("updates and deletes valid UUIDs", async () => {
    service.update.mockResolvedValue({ id: validId });
    service.delete.mockResolvedValue({ id: validId });
    const controller = new ManualPortfolioPositionController();
    const updateBody = { id: validId, product: "ETF" };
    const updated = await controller.update(
      request(JSON.stringify(updateBody)),
      "req",
    );
    expect(await updated.json()).toEqual({ position: { id: validId } });
    expect(service.update).toHaveBeenCalledWith(validId, updateBody, "req");
    const deleted = await controller.delete(
      request(JSON.stringify({ id: validId })),
      "req",
    );
    expect(await deleted.json()).toEqual({ id: validId });
    expect(service.delete).toHaveBeenCalledWith(validId, "req");
  });

  it("rejects invalid IDs and malformed request JSON", async () => {
    const controller = new ManualPortfolioPositionController();
    await expect(
      controller.update(request('{"id":"bad"}'), "req"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      controller.delete(request('{"id":"bad"}'), "req"),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(controller.create(request("{"), "req")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
