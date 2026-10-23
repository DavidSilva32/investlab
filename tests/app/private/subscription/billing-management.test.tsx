// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  act,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest, toast, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {}
  return {
    apiRequest: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    MockApiError,
  };
});
vi.mock("@/lib/api-client", () => ({
  apiRequest,
  ApiError: MockApiError,
}));
vi.mock("sonner", () => ({ toast }));

import { BillingManagement } from "@/app/(private)/subscription/_components/billing-management";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

beforeEach(() => {
  apiRequest.mockResolvedValue({
    enabled: false,
    amountCents: null,
    billingTypes: ["CREDIT_CARD"],
    subscription: null,
    checkout: null,
  });
});

describe("BillingManagement", () => {
  it("shows preparation state when purchasing is disabled", async () => {
    render(<BillingManagement />);
    expect(await screen.findByText("Contratação em preparação")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Continuar para pagamento" }),
    ).toBeNull();
  });

  it("offers supported billing methods and redirects to a safe hosted checkout", async () => {
    apiRequest
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      })
      .mockResolvedValueOnce({
        status: "PENDING",
        checkoutUrl: "https://asaas.com/checkoutSession/show?id=chk_1",
      })
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: {
          status: "PENDING",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          checkoutUrl: "https://asaas.com/checkoutSession/show?id=chk_1",
        },
      });
    render(<BillingManagement />);
    expect(
      await screen.findByText(
        "Cobrança mensal. Acesso ativado após confirmação do pagamento.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Boleto")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Continuar para pagamento" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/api/billing",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      (
        await screen.findByRole("link", {
          name: "Continuar no checkout seguro",
        })
      ).getAttribute("href"),
    ).toBe("https://asaas.com/checkoutSession/show?id=chk_1");
    expect(toast.success).toHaveBeenCalledWith(
      "Assinatura iniciada. Conclua o pagamento para ativar o acesso.",
    );
  });

  it("shows an active subscription and confirms cancellation before submitting it", async () => {
    apiRequest
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["PIX"],
        subscription: {
          status: "ACTIVE",
          billingType: "PIX",
          amountCents: 2500,
          nextDueDate: "2026-11-22",
          accessUntil: "2026-11-22T23:59:59.999Z",
        },
        checkout: null,
      })
      .mockResolvedValueOnce({ status: "CANCELED" })
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["PIX"],
        subscription: null,
        checkout: null,
      });
    render(<BillingManagement />);
    expect(await screen.findByText("Ativa")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar assinatura" }),
    );
    expect(await screen.findByText("Cancelar assinatura?")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/billing", {
        method: "DELETE",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Solicitação de cancelamento concluída.",
    );
  });

  it("shows a retryable loading error without leaking exception details", async () => {
    apiRequest
      .mockRejectedValueOnce(new Error("secret"))
      .mockRejectedValueOnce(new Error("another secret"))
      .mockRejectedValueOnce(new MockApiError("Serviço indisponível."))
      .mockResolvedValueOnce({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      });
    render(<BillingManagement />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os dados da assinatura.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os dados da assinatura.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Serviço indisponível.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Contratação em preparação")).toBeTruthy();
  });

  it("shows safe server errors and can retry when the billing response is empty", async () => {
    apiRequest
      .mockRejectedValueOnce(
        new MockApiError("Serviço temporariamente indisponível."),
      )
      .mockResolvedValueOnce(null);
    render(<BillingManagement />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Serviço temporariamente indisponível.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByText("Não foi possível carregar os dados."),
    ).toBeTruthy();
  });

  it.each([
    ["OVERDUE", "Pagamento pendente"],
    ["PENDING", "Aguardando pagamento"],
    ["CANCELED", "Cancelada"],
    ["REFUNDED", "Estornada"],
    ["CHARGEBACK", "Em contestação"],
    ["UNKNOWN", "Em processamento"],
  ])(
    "explains a %s subscription without offering cancellation",
    async (status, label) => {
      apiRequest.mockResolvedValueOnce({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: {
          status,
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          nextDueDate: null,
          accessUntil: "not-a-date",
        },
        checkout: null,
      });
      render(<BillingManagement />);
      expect(await screen.findByText(label)).toBeTruthy();
      expect(screen.getByText(/R\$.*25,00/)).toBeTruthy();
      expect(
        Boolean(screen.queryByRole("button", { name: "Cancelar assinatura" })),
      ).toBe(["OVERDUE", "PENDING"].includes(status));
    },
  );

  it("offers a pending checkout only for a trusted Asaas URL and reports confirmation for other checkout states", async () => {
    apiRequest.mockResolvedValueOnce({
      enabled: false,
      amountCents: null,
      billingTypes: ["CREDIT_CARD"],
      subscription: null,
      checkout: {
        status: "PENDING",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        checkoutUrl: "not a valid url",
      },
    });
    render(<BillingManagement />);
    expect(await screen.findByText("InvestLab Pro")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /checkout seguro/i })).toBeNull();
    cleanup();
    apiRequest.mockResolvedValueOnce({
      enabled: false,
      amountCents: null,
      billingTypes: ["CREDIT_CARD"],
      subscription: null,
      checkout: {
        status: "PAID",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        checkoutUrl: null,
      },
    });
    render(<BillingManagement />);
    expect((await screen.findByRole("status")).textContent).toContain(
      "Estamos confirmando a assinatura com o Asaas.",
    );
  });

  it("reports failed subscribe and cancellation operations with safe feedback", async () => {
    apiRequest
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      })
      .mockRejectedValueOnce(new Error("private provider detail"));
    render(<BillingManagement />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continuar para pagamento" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível iniciar a assinatura.",
      ),
    );

    apiRequest
      .mockResolvedValueOnce({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: {
          status: "ACTIVE",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          nextDueDate: null,
          accessUntil: null,
        },
        checkout: null,
      })
      .mockRejectedValueOnce(new Error("private provider detail"));
    cleanup();
    render(<BillingManagement />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar assinatura" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar cancelamento" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível cancelar a assinatura.",
      ),
    );
  });

  it("keeps an active subscription honest when the access date is unconfirmed", async () => {
    apiRequest.mockResolvedValueOnce({
      enabled: false,
      amountCents: null,
      billingTypes: ["CREDIT_CARD"],
      subscription: {
        status: "ACTIVE",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        nextDueDate: null,
        accessUntil: null,
      },
      checkout: null,
    });
    render(<BillingManagement />);
    expect(
      await screen.findByText(
        "Assinatura ativa. A data de término do acesso ainda não foi confirmada.",
      ),
    ).toBeTruthy();
  });

  it("preserves an invalid provider access date as received and skips checkout from a safe fallback", async () => {
    apiRequest.mockResolvedValueOnce({
      enabled: false,
      amountCents: null,
      billingTypes: ["CREDIT_CARD"],
      subscription: {
        status: "ACTIVE",
        billingType: "CREDIT_CARD",
        amountCents: 2500,
        nextDueDate: null,
        accessUntil: "data-indisponivel",
      },
      checkout: null,
    });
    render(<BillingManagement />);
    expect(
      await screen.findByText("Acesso confirmado até data-indisponivel."),
    ).toBeTruthy();
  });

  it.each(["http://asaas.com/pay", "https://example.com/pay"])(
    "does not expose a checkout link for an unsupported payment host (%s)",
    async (checkoutUrl) => {
      apiRequest.mockResolvedValueOnce({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: {
          status: "PENDING",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          checkoutUrl,
        },
      });
      render(<BillingManagement />);
      expect(await screen.findByText("InvestLab Pro")).toBeTruthy();
      expect(
        screen.queryByRole("link", { name: /checkout seguro/i }),
      ).toBeNull();
    },
  );

  it("ignores an initial billing response after the component unmounts", async () => {
    let resolveBilling!: (value: unknown) => void;
    apiRequest.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBilling = resolve;
      }),
    );
    const { unmount } = render(<BillingManagement />);
    unmount();
    await act(async () => {
      resolveBilling({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      });
    });
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it("ignores an initial billing error after the component unmounts", async () => {
    let rejectBilling!: (error: Error) => void;
    apiRequest.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectBilling = reject;
      }),
    );
    const { unmount } = render(<BillingManagement />);
    unmount();
    await act(async () => {
      rejectBilling(new Error("private error"));
    });
    expect(apiRequest).toHaveBeenCalledOnce();
  });

  it("preserves client-safe subscription and cancellation errors", async () => {
    apiRequest
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      })
      .mockRejectedValueOnce(new MockApiError("Plano em manutenção."));
    render(<BillingManagement />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Continuar para pagamento" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Plano em manutenção."),
    );

    cleanup();
    apiRequest
      .mockResolvedValueOnce({
        enabled: false,
        amountCents: null,
        billingTypes: ["CREDIT_CARD"],
        subscription: {
          status: "ACTIVE",
          billingType: "CREDIT_CARD",
          amountCents: 2500,
          nextDueDate: null,
          accessUntil: null,
        },
        checkout: null,
      })
      .mockRejectedValueOnce(new MockApiError("Cancelamento indisponível."));
    render(<BillingManagement />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancelar assinatura" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirmar cancelamento" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Cancelamento indisponível."),
    );
  });

  it("uses provider-safe messages and shows processing feedback while checkout starts", async () => {
    let resolveCheckout!: (value: {
      status: string;
      checkoutUrl: string;
    }) => void;
    apiRequest
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCheckout = resolve;
        }),
      )
      .mockResolvedValueOnce({
        enabled: true,
        amountCents: 2500,
        billingTypes: ["CREDIT_CARD"],
        subscription: null,
        checkout: null,
      });
    render(<BillingManagement />);
    const button = await screen.findByRole("button", {
      name: "Continuar para pagamento",
    });
    fireEvent.click(button);
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
    await act(async () => {
      resolveCheckout({
        status: "PENDING",
        checkoutUrl: "https://example.com/unsafe",
      });
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Assinatura iniciada. Conclua o pagamento para ativar o acesso.",
      ),
    );
    expect(screen.queryByRole("link", { name: /checkout seguro/i })).toBeNull();
  });
});
