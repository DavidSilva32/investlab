import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";

const service = vi.hoisted(() => ({
  getCurrentOwnerBilling: vi.fn(),
  subscribeCurrentOwner: vi.fn(),
  cancelCurrentOwnerSubscription: vi.fn(),
  receiveAsaasWebhook: vi.fn(),
}));
vi.mock("@/backend/services/billing.service", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/backend/services/billing.service")
  >()),
  billingService: service,
}));

import { BillingController } from "@/backend/controllers/billing.controller";

const controller = new BillingController();

describe("BillingController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "hook-secret");
    service.getCurrentOwnerBilling.mockResolvedValue({ enabled: false });
    service.subscribeCurrentOwner.mockResolvedValue({
      status: "PENDING",
      checkoutUrl: "https://asaas.com/x",
    });
    service.cancelCurrentOwnerSubscription.mockResolvedValue({
      status: "CANCELED",
    });
    service.receiveAsaasWebhook.mockResolvedValue({
      duplicate: false,
      matched: true,
    });
  });

  it("returns private no-store billing state and safely maps application errors", async () => {
    const response = await controller.get();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: false });
    service.getCurrentOwnerBilling.mockRejectedValueOnce(
      new ApplicationError("Conta não encontrada.", 404),
    );
    const failure = await controller.get();
    expect(failure.status).toBe(404);
    expect(await failure.json()).toEqual({ message: "Conta não encontrada." });
    service.cancelCurrentOwnerSubscription.mockRejectedValueOnce(
      new ApplicationError("Assinatura não encontrada.", 404),
    );
    const cancelFailure = await controller.cancel();
    expect(cancelFailure.status).toBe(404);
    expect(await cancelFailure.json()).toEqual({
      message: "Assinatura não encontrada.",
    });
  });

  it("validates hosted payment method and handles subscribe/cancel operations", async () => {
    const invalid = await controller.subscribe(
      new Request("https://app.test/api/billing", {
        method: "POST",
        body: JSON.stringify({ billingType: "PIX" }),
      }),
    );
    expect(invalid.status).toBe(400);
    const malformed = await controller.subscribe(
      new Request("https://app.test/api/billing", {
        method: "POST",
        body: "invalid",
      }),
    );
    expect(malformed.status).toBe(400);
    const response = await controller.subscribe(
      new Request("https://app.test/api/billing", {
        method: "POST",
        body: JSON.stringify({ billingType: "CREDIT_CARD" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.subscribeCurrentOwner).toHaveBeenCalledWith("CREDIT_CARD");
    service.subscribeCurrentOwner.mockRejectedValueOnce(new Error("secret"));
    expect(
      (
        await controller.subscribe(
          new Request("https://app.test/api/billing", {
            method: "POST",
            body: JSON.stringify({ billingType: "CREDIT_CARD" }),
          }),
        )
      ).status,
    ).toBe(500);
    expect(await (await controller.cancel()).json()).toEqual({
      status: "CANCELED",
    });
  });

  it("authenticates and validates webhooks, acknowledges duplicates, and retries persistence failures", async () => {
    const unauthorized = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: "{}",
        headers: { "asaas-access-token": "hook-secrex" },
      }),
    );
    expect(unauthorized.status).toBe(401);
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
    const missingExpectedToken = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: "{}",
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(missingExpectedToken.status).toBe(401);
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "hook-secret");
    const invalid = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: "{}",
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(invalid.status).toBe(400);
    const malformedJson = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: "{",
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(malformedJson.status).toBe(400);
    const response = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: JSON.stringify({
          id: "evt-1",
          event: "CHECKOUT_PAID",
          dateCreated: "2024-10-16 11:11:04",
          checkout: { id: "chk-1", externalReference: "ref-1" },
        }),
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect(service.receiveAsaasWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "evt-1" }),
    );
    service.receiveAsaasWebhook.mockResolvedValueOnce({
      duplicate: true,
      matched: false,
    });
    const duplicate = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: JSON.stringify({
          id: "evt-1",
          event: "CHECKOUT_PAID",
          dateCreated: "2024-10-16 11:11:04",
        }),
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(await duplicate.json()).toEqual({ received: true, duplicate: true });
    service.receiveAsaasWebhook.mockRejectedValueOnce(
      new Error("database failure"),
    );
    const retry = await controller.webhook(
      new Request("https://app.test/api/webhooks/asaas", {
        method: "POST",
        body: JSON.stringify({
          id: "evt-2",
          event: "PAYMENT_CONFIRMED",
          dateCreated: "2024-10-16 11:11:04",
        }),
        headers: { "asaas-access-token": "hook-secret" },
      }),
    );
    expect(retry.status).toBe(500);
    expect(await retry.json()).toEqual({
      message: "Não foi possível receber o evento.",
    });
  });
});
