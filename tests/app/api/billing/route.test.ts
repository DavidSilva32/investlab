import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  get: vi.fn(),
  subscribe: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/backend/controllers/billing.controller", () => ({
  billingController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (
    _method: string,
    _route: string,
    handler: (request?: Request) => Promise<Response>,
  ) => handler,
}));

import { DELETE, GET, POST } from "@/app/api/billing/route";

describe("billing routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    controller.get.mockResolvedValue(Response.json({ enabled: false }));
    controller.subscribe.mockResolvedValue(
      Response.json({ checkoutUrl: "https://asaas.test" }),
    );
    controller.cancel.mockResolvedValue(Response.json({ status: "CANCELED" }));
  });

  it("delegates billing reads to the controller", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(controller.get).toHaveBeenCalledOnce();
  });

  it("forwards subscription requests to the controller", async () => {
    const request = new Request("https://test/api/billing", { method: "POST" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(controller.subscribe).toHaveBeenCalledWith(request);
  });

  it("delegates cancellation requests to the controller", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(controller.cancel).toHaveBeenCalledOnce();
  });
});
