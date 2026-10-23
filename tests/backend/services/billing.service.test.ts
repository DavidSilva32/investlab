import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getCurrentOwnerProfile: vi.fn(),
  getCurrentOwnerSubscription: vi.fn(),
  getCurrentOwnerCheckout: vi.fn(),
  reserveCheckout: vi.fn(),
  attachProviderCheckout: vi.fn(),
  abandonCheckout: vi.fn(),
  cancelCurrentOwnerSubscription: vi.fn(),
  markCanceled: vi.fn(),
  cancelCheckout: vi.fn(),
  getCheckoutConflictForPaidWebhook: vi.fn(),
  hasPaidAccess: vi.fn(),
  receiveWebhook: vi.fn(),
}));
const provider = vi.hoisted(() => ({
  createCheckout: vi.fn(),
  getSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  cancelCheckout: vi.fn(),
}));
vi.mock("@/backend/repositories/billing.repository", () => ({
  billingRepository: repository,
}));
vi.mock("@/backend/providers/asaas.provider", () => ({
  asaasProvider: provider,
}));

import {
  BillingService,
  parseAsaasDateCreated,
} from "@/backend/services/billing.service";

const service = new BillingService();
const profile = { id: "user-1", name: "Ana", email: "ana@example.com" };

function enableSandbox() {
  vi.stubEnv("ASAAS_BILLING_ENABLED", "true");
  vi.stubEnv("ASAAS_API_KEY", "sandbox-key");
  vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
  vi.stubEnv("ASAAS_SUBSCRIPTION_AMOUNT_CENTS", "2500");
  vi.stubEnv("BETTER_AUTH_URL", "https://investlab-amber.vercel.app");
}

describe("BillingService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    repository.getCurrentOwnerProfile.mockResolvedValue(profile);
    repository.getCurrentOwnerSubscription.mockResolvedValue(null);
    repository.getCurrentOwnerCheckout.mockResolvedValue(null);
    repository.reserveCheckout.mockResolvedValue({ id: "local-checkout" });
    repository.attachProviderCheckout.mockResolvedValue({
      id: "local-checkout",
    });
    repository.abandonCheckout.mockResolvedValue(undefined);
    repository.cancelCurrentOwnerSubscription.mockResolvedValue({
      id: "row-1",
    });
    repository.cancelCheckout.mockResolvedValue(undefined);
    repository.markCanceled.mockResolvedValue(undefined);
    repository.hasPaidAccess.mockResolvedValue(true);
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue(null);
    repository.receiveWebhook.mockResolvedValue({
      duplicate: false,
      matched: true,
    });
    provider.createCheckout.mockResolvedValue({ id: "chk_1" });
    provider.getSubscription.mockResolvedValue({
      id: "sub_1",
      nextDueDate: "2026-11-23",
    });
    provider.cancelSubscription.mockResolvedValue({ id: "sub_1" });
    provider.cancelCheckout.mockResolvedValue({ id: "chk_1" });
  });

  it("parses only valid deterministic Asaas event timestamps", () => {
    expect(parseAsaasDateCreated()).toBeNull();
    expect(parseAsaasDateCreated("2026-02-30 12:00:00")).toBeNull();
    expect(parseAsaasDateCreated("not-a-date")).toBeNull();
    expect(parseAsaasDateCreated("2026-10-22T12:00:00Z")).toEqual(
      new Date("2026-10-22T12:00:00.000Z"),
    );
    expect(parseAsaasDateCreated("2026-02-30T12:00:00Z")).toBeNull();
    expect(parseAsaasDateCreated("2026-01-01T25:00:00Z")).toBeNull();
  });

  it("maps the current subscription and checkout while omitting an unconfirmed access date", async () => {
    repository.getCurrentOwnerSubscription.mockResolvedValue({
      status: "ACTIVE",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
      accessUntil: null,
    });
    repository.getCurrentOwnerCheckout.mockResolvedValue({
      status: "PENDING",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      checkoutUrl: null,
    });
    await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
      subscription: {
        status: "ACTIVE",
        accessUntil: null,
      },
      checkout: { status: "PENDING", checkoutUrl: null },
    });
    repository.getCurrentOwnerSubscription.mockResolvedValueOnce({
      status: "ACTIVE",
      billingType: "CREDIT_CARD",
      amountCents: 2500,
      nextDueDate: "2026-11-22",
      accessUntil: new Date("2026-11-22T23:59:59.999Z"),
    });
    await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
      subscription: { accessUntil: "2026-11-22T23:59:59.999Z" },
    });
  });

  it("exposes billing disabled without complete commercial config and lists hosted methods", async () => {
    await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
      enabled: false,
      amountCents: null,
      billingTypes: ["CREDIT_CARD"],
      subscription: null,
      checkout: null,
    });
    repository.getCurrentOwnerProfile.mockResolvedValue(null);
    await expect(service.getCurrentOwnerBilling()).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it("requires a valid configured price and explicit approval for live billing", async () => {
    enableSandbox();
    for (const amount of ["10.2", "9007199254740992", "0"]) {
      vi.stubEnv("ASAAS_SUBSCRIPTION_AMOUNT_CENTS", amount);
      await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
        enabled: false,
        amountCents: null,
      });
    }
    vi.stubEnv("ASAAS_SUBSCRIPTION_AMOUNT_CENTS", "1200");
    vi.stubEnv("ASAAS_ENVIRONMENT", "production");
    await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
      enabled: false,
      amountCents: 1200,
    });
    vi.stubEnv("ASAAS_LIVE_BILLING_APPROVED", "true");
    await expect(service.getCurrentOwnerBilling()).resolves.toMatchObject({
      enabled: true,
    });
  });

  it("reserves a local checkout before creating hosted recurring checkout and returns redirect URL", async () => {
    enableSandbox();
    const result = await service.subscribeCurrentOwner("CREDIT_CARD");
    expect(repository.reserveCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        externalReference: expect.any(String),
        billingType: "CREDIT_CARD",
        amountCents: 2500,
      }),
    );
    const call = provider.createCheckout.mock.calls[0][0];
    expect(call).toMatchObject({
      billingType: "CREDIT_CARD",
      value: 25,
      externalReference:
        repository.reserveCheckout.mock.calls[0][0].externalReference,
      successUrl:
        "https://investlab-amber.vercel.app/assinatura?checkout=return",
      cancelUrl:
        "https://investlab-amber.vercel.app/assinatura?checkout=return",
      expiredUrl:
        "https://investlab-amber.vercel.app/assinatura?checkout=return",
    });
    expect(repository.attachProviderCheckout).toHaveBeenCalledWith({
      externalReference: call.externalReference,
      providerCheckoutId: "chk_1",
      checkoutUrl: "https://asaas.com/checkoutSession/show?id=chk_1",
    });
    expect(result).toEqual({
      status: "PENDING",
      checkoutUrl: "https://asaas.com/checkoutSession/show?id=chk_1",
    });
  });

  it("uses provider URL when present, abandons failed checkouts, and cancels unattached provider checkout", async () => {
    enableSandbox();
    provider.createCheckout.mockResolvedValueOnce({
      id: "chk_1",
      url: "https://asaas.com/hosted/1",
    });
    await expect(service.subscribeCurrentOwner("CREDIT_CARD")).resolves.toEqual(
      {
        status: "PENDING",
        checkoutUrl: "https://asaas.com/hosted/1",
      },
    );
    repository.attachProviderCheckout.mockResolvedValueOnce(null);
    provider.cancelCheckout.mockRejectedValueOnce(new Error("provider error"));
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(provider.cancelCheckout).toHaveBeenCalledWith("chk_1");
    provider.createCheckout.mockRejectedValueOnce(
      new Error("provider details"),
    );
    await expect(service.subscribeCurrentOwner("CREDIT_CARD")).rejects.toThrow(
      "provider details",
    );
    expect(repository.abandonCheckout).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the configured amount becomes invalid before checkout reservation", async () => {
    enableSandbox();
    repository.getCurrentOwnerProfile.mockImplementationOnce(async () => {
      vi.stubEnv("ASAAS_SUBSCRIPTION_AMOUNT_CENTS", "not-a-number");
      return profile;
    });
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.reserveCheckout).not.toHaveBeenCalled();
  });

  it("rejects checkout when there is another subscription, pending checkout, or missing account", async () => {
    enableSandbox();
    repository.getCurrentOwnerSubscription.mockResolvedValue({
      status: "ACTIVE",
    });
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 409 });
    repository.getCurrentOwnerSubscription.mockResolvedValue(null);
    repository.getCurrentOwnerCheckout.mockResolvedValue({ status: "PENDING" });
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 409 });
    repository.getCurrentOwnerCheckout.mockResolvedValue(null);
    repository.getCurrentOwnerProfile.mockResolvedValue(null);
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("requires configured callback origin", async () => {
    enableSandbox();
    vi.stubEnv("BETTER_AUTH_URL", "");
    await expect(
      service.subscribeCurrentOwner("CREDIT_CARD"),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.reserveCheckout).not.toHaveBeenCalled();
  });

  it("cancels an owned subscription or pending hosted checkout", async () => {
    repository.getCurrentOwnerSubscription.mockResolvedValue(null);
    repository.getCurrentOwnerCheckout.mockResolvedValue(null);
    await expect(
      service.cancelCurrentOwnerSubscription(),
    ).rejects.toMatchObject({ statusCode: 404 });
    repository.getCurrentOwnerSubscription.mockResolvedValue({
      providerSubscriptionId: "sub_2",
    });
    repository.cancelCurrentOwnerSubscription.mockResolvedValue(null);
    await expect(
      service.cancelCurrentOwnerSubscription(),
    ).rejects.toMatchObject({ statusCode: 404 });
    repository.cancelCurrentOwnerSubscription.mockResolvedValue({
      id: "row_2",
    });
    await expect(service.cancelCurrentOwnerSubscription()).resolves.toEqual({
      status: "CANCELED",
    });
    expect(provider.cancelSubscription).toHaveBeenCalledWith("sub_2");
    expect(repository.markCanceled).toHaveBeenCalledWith("sub_2");
    repository.getCurrentOwnerSubscription.mockResolvedValue(null);
    repository.getCurrentOwnerCheckout.mockResolvedValue({
      providerCheckoutId: "chk_2",
    });
    await expect(service.cancelCurrentOwnerSubscription()).resolves.toEqual({
      status: "CANCELED",
    });
    expect(provider.cancelCheckout).toHaveBeenCalledWith("chk_2");
    expect(repository.cancelCheckout).toHaveBeenCalledWith("chk_2");
  });

  it("maps checkout, subscription, and payment events and correlates hosted checkout reference", async () => {
    await service.receiveAsaasWebhook({
      eventId: "e1",
      event: "CHECKOUT_PAID",
      dateCreated: "2024-10-16 11:11:04",
      checkout: { id: "chk", externalReference: "ref", status: "PAID" },
    });
    expect(repository.receiveWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventId: "e1",
        checkoutStatus: "PAID",
        providerCreatedAt: new Date("2024-10-16T11:11:04.000Z"),
        externalReference: "ref",
        checkoutId: "chk",
      }),
    );
    await service.receiveAsaasWebhook({
      eventId: "e2",
      event: "SUBSCRIPTION_CREATED",
      subscription: {
        id: "s1",
        status: "ACTIVE",
        nextDueDate: "2026-11-23",
        externalReference: null,
      },
      checkout: { id: "checkout-s1", externalReference: "ref-s1" },
    });
    expect(repository.receiveWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        subscriptionId: "s1",
        subscriptionStatus: "ACTIVE",
        checkoutId: "checkout-s1",
        externalReference: "ref-s1",
      }),
    );
    await service.receiveAsaasWebhook({
      eventId: "e2b",
      event: "SUBSCRIPTION_CREATED",
      checkout: { id: "checkout-s2", externalReference: "ref-s2" },
      subscription: { id: "s2", status: "ACTIVE" },
    });
    expect(provider.getSubscription).toHaveBeenCalledWith("s2");
    expect(repository.receiveWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextDueDate: "2026-11-23" }),
    );
    await service.receiveAsaasWebhook({
      eventId: "e3",
      event: "PAYMENT_CONFIRMED",
      payment: { subscription: "s1" },
    });
    expect(provider.getSubscription).toHaveBeenCalledWith("s1");
    expect(repository.receiveWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paymentStatus: "ACTIVE",
        nextDueDate: "2026-11-23",
      }),
    );
    const events = [
      "PAYMENT_RECEIVED",
      "PAYMENT_OVERDUE",
      "PAYMENT_REFUNDED",
      "PAYMENT_CHARGEBACK_REQUESTED",
      "PAYMENT_CHARGEBACK_DISPUTE",
      "SUBSCRIPTION_DELETED",
      "SUBSCRIPTION_INACTIVATED",
      "CHECKOUT_CANCELED",
      "CHECKOUT_EXPIRED",
      "UNMAPPED",
    ];
    for (const [index, event] of events.entries()) {
      await service.receiveAsaasWebhook({
        eventId: `e${index + 4}`,
        event,
        checkout: { id: "chk", externalReference: "ref" },
        payment: { subscription: "s1", dueDate: "2026-11-01" },
        subscription: {
          id: "s1",
          status: event === "SUBSCRIPTION_INACTIVATED" ? "INACTIVE" : "ACTIVE",
        },
      });
    }
    const statuses = repository.receiveWebhook.mock.calls.map(([input]) => ({
      checkoutStatus: input.checkoutStatus,
      subscriptionStatus: input.subscriptionStatus,
      paymentStatus: input.paymentStatus,
    }));
    expect(
      statuses.some((status) => status.checkoutStatus === "CANCELED"),
    ).toBe(true);
    expect(statuses.some((status) => status.checkoutStatus === "EXPIRED")).toBe(
      true,
    );
    expect(
      statuses.some((status) => status.subscriptionStatus === "CANCELED"),
    ).toBe(true);
    expect(statuses.some((status) => status.paymentStatus === "OVERDUE")).toBe(
      true,
    );
    expect(statuses.some((status) => status.paymentStatus === "REFUNDED")).toBe(
      true,
    );
    expect(
      statuses.some((status) => status.paymentStatus === "CHARGEBACK"),
    ).toBe(true);
  });

  it("maps a confirmed payment to a completed checkout milestone", async () => {
    await service.receiveAsaasWebhook({
      eventId: "confirmed-payment-checkout",
      event: "PAYMENT_CONFIRMED",
      dateCreated: "2026-10-22 12:00:00",
      checkout: { id: "checkout-id" },
      payment: { subscription: "subscription-id" },
    });
    expect(repository.getCheckoutConflictForPaidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCheckoutId: "checkout-id",
        incomingStatus: "COMPLETED",
      }),
    );
  });

  it("falls back to the subscription external reference when checkout omits it", async () => {
    await service.receiveAsaasWebhook({
      eventId: "subscription-reference-fallback",
      event: "SUBSCRIPTION_CREATED",
      dateCreated: "2026-10-22 12:00:00",
      checkout: { id: "checkout-id" },
      subscription: {
        id: "subscription-id",
        status: "ACTIVE",
        nextDueDate: "2026-11-22",
        externalReference: "subscription-reference",
      },
    });
    expect(repository.getCheckoutConflictForPaidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCheckoutId: "checkout-id",
        externalReference: "subscription-reference",
      }),
    );
  });

  it("cancels a replacement checkout before recording a delayed paid checkout", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PENDING",
      providerCheckoutId: "replacement-provider",
    });

    await service.receiveAsaasWebhook({
      eventId: "late-paid-event",
      event: "CHECKOUT_PAID",
      dateCreated: "2026-10-22 12:00:00",
      checkout: {
        id: "expired-provider",
        externalReference: "ref",
        status: "PAID",
      },
    });

    expect(provider.cancelCheckout).toHaveBeenCalledWith(
      "replacement-provider",
    );
    expect(provider.cancelCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      repository.receiveWebhook.mock.invocationCallOrder[0],
    );
    expect(repository.receiveWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutId: "expired-provider",
        checkoutStatus: "PAID",
        competingCheckoutToCancelId: "replacement-local",
      }),
    );
  });

  it("reconciles a delayed subscription-created event when checkout-paid was missed", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PENDING",
      providerCheckoutId: "replacement-provider",
    });

    await service.receiveAsaasWebhook({
      eventId: "late-subscription-created",
      event: "SUBSCRIPTION_CREATED",
      dateCreated: "2026-10-22 12:00:00",
      checkout: {
        id: "expired-provider",
        externalReference: "old-reference",
      },
      subscription: {
        id: "subscription-for-old-checkout",
        status: "ACTIVE",
        nextDueDate: "2026-11-22",
      },
    });

    expect(repository.getCheckoutConflictForPaidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCheckoutId: "expired-provider",
        incomingStatus: "SUBSCRIPTION_CREATED",
      }),
    );
    expect(provider.cancelCheckout).toHaveBeenCalledWith(
      "replacement-provider",
    );
    expect(repository.receiveWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutId: "expired-provider",
        subscriptionStatus: "ACTIVE",
        competingCheckoutToCancelId: "replacement-local",
      }),
    );
  });

  it("rejects an uncorrelated Asaas subscription-created payload for retry", async () => {
    await expect(
      service.receiveAsaasWebhook({
        eventId: "uncorrelated-subscription-created",
        event: "SUBSCRIPTION_CREATED",
        dateCreated: "2026-10-22 12:00:00",
        subscription: {
          id: "unknown-subscription",
          status: "ACTIVE",
          externalReference: null,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(repository.receiveWebhook).not.toHaveBeenCalled();
    await expect(
      service.receiveAsaasWebhook({
        eventId: "uncorrelated-checkout-paid",
        event: "CHECKOUT_PAID",
        dateCreated: "2026-10-22 12:00:00",
        checkout: { status: "PAID" },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(repository.receiveWebhook).not.toHaveBeenCalled();
  });

  it("uses external reference to reconcile a paid webhook without checkout id", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PENDING",
      providerCheckoutId: "replacement-provider",
    });

    await service.receiveAsaasWebhook({
      eventId: "paid-with-reference-only",
      event: "CHECKOUT_PAID",
      dateCreated: "2026-10-22 12:00:00",
      checkout: { externalReference: "old-reference", status: "PAID" },
    });

    expect(repository.getCheckoutConflictForPaidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCheckoutId: null,
        externalReference: "old-reference",
      }),
    );
    expect(provider.cancelCheckout).toHaveBeenCalledWith(
      "replacement-provider",
    );
    expect(repository.receiveWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutId: null,
        externalReference: "old-reference",
        competingCheckoutToCancelId: "replacement-local",
      }),
    );
  });

  it("does not acknowledge a delayed payment when the replacement cannot be reconciled", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PENDING",
      providerCheckoutId: "replacement-provider",
    });
    provider.cancelCheckout.mockRejectedValue(
      new Error("provider unavailable"),
    );

    const delayedPaidEvent = {
      eventId: "late-paid-event",
      event: "CHECKOUT_PAID",
      dateCreated: "2026-10-22 12:00:00",
      checkout: { id: "expired-provider", status: "PAID" },
    };
    await expect(
      service.receiveAsaasWebhook(delayedPaidEvent),
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(
      service.receiveAsaasWebhook(delayedPaidEvent),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(provider.cancelCheckout).toHaveBeenCalledTimes(2);
    expect(repository.receiveWebhook).not.toHaveBeenCalled();
  });

  it("retries an old payment after the official cancellation webhook clears the replacement", async () => {
    let replacementStatus = "PENDING";
    repository.getCheckoutConflictForPaidWebhook.mockImplementation(
      async ({ providerCheckoutId }: { providerCheckoutId: string | null }) =>
        providerCheckoutId === "expired-provider" &&
        replacementStatus === "PENDING"
          ? {
              id: "replacement-local",
              status: "PENDING",
              providerCheckoutId: "replacement-provider",
            }
          : null,
    );
    repository.receiveWebhook.mockImplementation(async (input) => {
      if (
        input.eventType === "CHECKOUT_PAID" &&
        replacementStatus === "PENDING"
      )
        throw new Error("database transaction rolled back");
      if (
        input.checkoutId === "replacement-provider" &&
        input.checkoutStatus === "CANCELED"
      )
        replacementStatus = "CANCELED";
      return { duplicate: false, matched: true };
    });
    const oldPayment = {
      event: "CHECKOUT_PAID",
      dateCreated: "2026-10-22 12:00:00",
      checkout: { id: "expired-provider", status: "PAID" },
    };

    await expect(
      service.receiveAsaasWebhook({ eventId: "old-payment-1", ...oldPayment }),
    ).rejects.toThrow("database transaction rolled back");
    expect(provider.cancelCheckout).toHaveBeenCalledTimes(1);

    await service.receiveAsaasWebhook({
      eventId: "replacement-canceled",
      event: "CHECKOUT_CANCELED",
      dateCreated: "2026-10-22 12:01:00",
      checkout: { id: "replacement-provider", status: "CANCELED" },
    });
    expect(replacementStatus).toBe("CANCELED");

    await expect(
      service.receiveAsaasWebhook({ eventId: "old-payment-2", ...oldPayment }),
    ).resolves.toMatchObject({ matched: true });
    expect(provider.cancelCheckout).toHaveBeenCalledTimes(1);
    expect(repository.receiveWebhook).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventId: "old-payment-2",
        checkoutStatus: "PAID",
        competingCheckoutToCancelId: null,
      }),
    );
  });

  it("does not persist an old payment if a repeated provider cancellation fails", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PENDING",
      providerCheckoutId: "replacement-provider",
    });
    provider.cancelCheckout.mockRejectedValue(
      new Error("provider unavailable"),
    );

    await expect(
      service.receiveAsaasWebhook({
        eventId: "late-paid-event",
        event: "CHECKOUT_PAID",
        dateCreated: "2026-10-22 12:00:00",
        checkout: { id: "expired-provider", status: "PAID" },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(repository.receiveWebhook).not.toHaveBeenCalled();
  });

  it("fails closed when the competing checkout is already paid", async () => {
    repository.getCheckoutConflictForPaidWebhook.mockResolvedValue({
      id: "replacement-local",
      status: "PAID",
      providerCheckoutId: "replacement-provider",
    });

    await expect(
      service.receiveAsaasWebhook({
        eventId: "late-paid-event",
        event: "CHECKOUT_PAID",
        dateCreated: "2026-10-22 12:00:00",
        checkout: { id: "expired-provider", status: "PAID" },
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(provider.cancelCheckout).not.toHaveBeenCalled();
    expect(repository.receiveWebhook).not.toHaveBeenCalled();
  });

  it("rejects a payment confirmation without provider-confirmed period end", async () => {
    provider.getSubscription.mockResolvedValue({ id: "s1" });
    await expect(
      service.receiveAsaasWebhook({
        eventId: "evt",
        event: "PAYMENT_CONFIRMED",
        payment: { subscription: "s1" },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
    await expect(
      service.receiveAsaasWebhook({
        eventId: "created",
        event: "SUBSCRIPTION_CREATED",
        subscription: { id: "s2" },
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("delegates paid-access checks", async () => {
    await expect(service.hasPaidAccess("user-1")).resolves.toBe(true);
    expect(repository.hasPaidAccess).toHaveBeenCalledWith("user-1");
  });
});
