import { ApplicationError } from "@/backend/errors/application-error";

export type AsaasEnvironment = "sandbox" | "production";

export type AsaasCustomer = {
  id: string;
};

export type AsaasSubscription = {
  id: string;
  status?: string;
  nextDueDate?: string;
};

export type AsaasCheckout = { id: string; url?: string };

type AsaasResponse<T> = T & { errors?: Array<{ description?: string }> };

export class AsaasProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly environment: AsaasEnvironment = process.env
      .ASAAS_ENVIRONMENT === "production"
      ? "production"
      : "sandbox",
    private readonly apiKey = process.env.ASAAS_API_KEY,
  ) {}

  private get baseUrl() {
    return this.environment === "production"
      ? "https://api.asaas.com/v3"
      : "https://api-sandbox.asaas.com/v3";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new ApplicationError(
        "A integração de pagamentos ainda não está configurada.",
        503,
      );
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          access_token: this.apiKey,
          ...(init.headers ?? {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ApplicationError(
        "Não foi possível conectar ao serviço de pagamentos.",
        502,
      );
    }
    let body: AsaasResponse<T>;
    try {
      body = (await response.json()) as AsaasResponse<T>;
    } catch {
      throw new ApplicationError(
        "O serviço de pagamentos retornou uma resposta inválida.",
        502,
      );
    }
    if (!response.ok) {
      throw new ApplicationError(
        "Não foi possível concluir a solicitação de pagamento.",
        response.status >= 500 ? 502 : 422,
      );
    }
    return body;
  }

  createCheckout(input: {
    billingType: "CREDIT_CARD";
    value: number;
    nextDueDate: string;
    externalReference: string;
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
  }) {
    return this.request<AsaasCheckout>("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes: [input.billingType],
        chargeTypes: ["RECURRENT"],
        minutesToExpire: 60,
        externalReference: input.externalReference,
        callback: {
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          expiredUrl: input.expiredUrl,
        },
        items: [
          {
            name: "InvestLab Pro",
            description: "Assinatura mensal InvestLab Pro",
            quantity: 1,
            value: input.value,
          },
        ],
        subscription: { cycle: "MONTHLY", nextDueDate: input.nextDueDate },
      }),
    });
  }

  getSubscription(subscriptionId: string) {
    return this.request<AsaasSubscription>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
  }

  cancelSubscription(subscriptionId: string) {
    return this.request<{ id: string }>(
      `/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE" },
    );
  }

  cancelCheckout(checkoutId: string) {
    return this.request<{ id: string }>(
      `/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
      {
        method: "POST",
      },
    );
  }
}

export const asaasProvider = new AsaasProvider();
