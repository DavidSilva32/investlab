import { describe, expect, it, vi } from "vitest";
import { ApplicationError } from "@/backend/errors/application-error";
import { AsaasProvider } from "@/backend/providers/asaas.provider";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("AsaasProvider", () => {
  it("selects production or sandbox from the environment when no override is passed", async () => {
    vi.stubEnv("ASAAS_ENVIRONMENT", "production");
    const productionFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "subscription-1" }));
    await new AsaasProvider(productionFetch, undefined, "key").getSubscription(
      "subscription-1",
    );
    expect(productionFetch.mock.calls[0][0]).toBe(
      "https://api.asaas.com/v3/subscriptions/subscription-1",
    );

    vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
    const sandboxFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "subscription-2" }));
    await new AsaasProvider(sandboxFetch, undefined, "key").getSubscription(
      "subscription-2",
    );
    expect(sandboxFetch.mock.calls[0][0]).toBe(
      "https://api-sandbox.asaas.com/v3/subscriptions/subscription-2",
    );
    vi.unstubAllEnvs();
  });

  it("fails safely when credentials are missing", async () => {
    const fetcher = vi.fn();
    const provider = new AsaasProvider(fetcher, "sandbox", undefined);
    await expect(
      provider.createCheckout({
        billingType: "CREDIT_CARD",
        value: 25,
        nextDueDate: "2026-10-23",
        externalReference: "ref",
        successUrl: "https://investlab.test/assinatura",
        cancelUrl: "https://investlab.test/assinatura",
        expiredUrl: "https://investlab.test/assinatura",
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a hosted recurring checkout with supported payment types and callback URLs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "chk_1" }));
    const provider = new AsaasProvider(fetcher, "sandbox", "sandbox-key");
    const callbacks = {
      successUrl: "https://investlab.test/assinatura",
      cancelUrl: "https://investlab.test/assinatura",
      expiredUrl: "https://investlab.test/assinatura",
    };
    await expect(
      provider.createCheckout({
        billingType: "CREDIT_CARD",
        value: 25,
        nextDueDate: "2026-10-23",
        externalReference: "ref-1",
        ...callbacks,
      }),
    ).resolves.toEqual({ id: "chk_1" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.asaas.com/v3/checkouts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ access_token: "sandbox-key" }),
        cache: "no-store",
        body: JSON.stringify({
          billingTypes: ["CREDIT_CARD"],
          chargeTypes: ["RECURRENT"],
          minutesToExpire: 60,
          externalReference: "ref-1",
          callback: callbacks,
          items: [
            {
              name: "InvestLab Pro",
              description: "Assinatura mensal InvestLab Pro",
              quantity: 1,
              value: 25,
            },
          ],
          subscription: { cycle: "MONTHLY", nextDueDate: "2026-10-23" },
        }),
      }),
    );
  });

  it("reads and cancels provider subscriptions using encoded ids", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ id: "sub_2", nextDueDate: "2026-11-22" }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: "sub_2" }));
    const provider = new AsaasProvider(fetcher, "production", "production-key");
    await expect(provider.getSubscription("sub/2")).resolves.toMatchObject({
      id: "sub_2",
      nextDueDate: "2026-11-22",
    });
    await provider.cancelSubscription("sub/2");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api.asaas.com/v3/subscriptions/sub%2F2",
    );
    expect(fetcher.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("cancels a hosted checkout through the documented action endpoint", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "chk_1" }));
    const provider = new AsaasProvider(fetcher, "sandbox", "key");
    await provider.cancelCheckout("chk/1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api-sandbox.asaas.com/v3/checkouts/chk%2F1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps a failed cancellation retryable without an undocumented status lookup", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ errors: [{ description: "not cancellable" }] }, 422),
      );
    const provider = new AsaasProvider(fetcher, "sandbox", "key");

    await expect(provider.cancelCheckout("chk_1")).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://api-sandbox.asaas.com/v3/checkouts/chk_1/cancel",
    );
  });

  it("normalizes provider, network, and invalid response errors", async () => {
    const network = new AsaasProvider(
      vi.fn<typeof fetch>().mockRejectedValue(new Error("secret")),
      "sandbox",
      "key",
    );
    await expect(network.getSubscription("sub_1")).rejects.toMatchObject({
      message: "Não foi possível conectar ao serviço de pagamentos.",
      statusCode: 502,
    });
    const malformed = new AsaasProvider(
      vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json")),
      "sandbox",
      "key",
    );
    await expect(malformed.getSubscription("sub_1")).rejects.toMatchObject({
      statusCode: 502,
    });
    const rejected = new AsaasProvider(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ errors: [{ description: "secret" }] }, 400),
        ),
      "sandbox",
      "key",
    );
    await expect(rejected.getSubscription("sub_1")).rejects.toMatchObject({
      message: "Não foi possível concluir a solicitação de pagamento.",
      statusCode: 422,
    });
    const unavailable = new AsaasProvider(
      vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}, 503)),
      "sandbox",
      "key",
    );
    await expect(unavailable.getSubscription("sub_1")).rejects.toBeInstanceOf(
      ApplicationError,
    );
  });
});
