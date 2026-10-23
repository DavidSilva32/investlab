import { beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({ webhook: vi.fn() }));
vi.mock("@/backend/controllers/billing.controller", () => ({
  billingController: controller,
}));
vi.mock("@/infrastructure/logging/api-request", () => ({
  withApiRequestLogging: (
    _method: string,
    _route: string,
    handler: (request: Request) => Promise<Response>,
  ) => handler,
}));

import { POST } from "@/app/api/webhooks/asaas/route";

describe("Asaas webhook route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    controller.webhook.mockResolvedValue(Response.json({ received: true }));
  });

  it("forwards provider events to the billing controller", async () => {
    const request = new Request("https://test/api/webhooks/asaas", {
      method: "POST",
      body: JSON.stringify({ event: "CHECKOUT_PAID" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(controller.webhook).toHaveBeenCalledWith(request);
  });
});
