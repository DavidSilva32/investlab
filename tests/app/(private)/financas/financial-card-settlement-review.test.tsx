// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast }));

import { FinancialCardSettlementReview } from "@/app/(private)/financas/_components/financial-card-settlement-review";

const settlement = {
  id: "11111111-1111-4111-8111-111111111111",
  description: "Pagamento fatura cartão",
  actualDate: "2026-11-20",
  actualAmount: "100.00",
};
const cardEntries = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    description: "Compra A",
    actualDate: "2026-11-10",
    actualAmount: "40.00",
    sourceCategory: "COMPRAS",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    description: "Compra B",
    actualDate: "2026-11-12",
    actualAmount: "60.00",
    sourceCategory: "OUTROS",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    description: "Compra B um centavo a mais",
    actualDate: "2026-11-12",
    actualAmount: "60.01",
    sourceCategory: null,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    description: "Compra B um centavo a menos",
    actualDate: "2026-11-12",
    actualAmount: "59.99",
    sourceCategory: null,
  },
];

function renderReview(readOnly = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinancialCardSettlementReview readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  api.request.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("FinancialCardSettlementReview", () => {
  it("shows a real loading state before the review request resolves", async () => {
    let finish!: (value: {
      settlements: never[];
      cardEntries: never[];
    }) => void;
    api.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderReview();

    expect(
      screen.getByRole("status", { name: "Carregando pagamentos de fatura" }),
    ).toBeTruthy();
    finish({ settlements: [], cardEntries: [] });
    await waitFor(() =>
      expect(
        screen.queryByRole("status", {
          name: "Carregando pagamentos de fatura",
        }),
      ).toBeNull(),
    );
  });

  it("requires exact cent equality before confirming a complete invoice link", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({ settlements: [settlement], cardEntries })
      .mockResolvedValueOnce({ message: "Conferência salva." });
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    const checkbox = (description: string) =>
      screen.getByRole("checkbox", { name: description });
    const confirm = screen.getByRole("button", { name: "Confirmar vínculo" });

    await user.click(checkbox("Vincular Compra A de 10/11/2026"));
    await user.click(
      checkbox("Vincular Compra B um centavo a mais de 12/11/2026"),
    );
    expect(confirm.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "igual ao pagamento",
    );

    await user.click(
      checkbox("Vincular Compra B um centavo a mais de 12/11/2026"),
    );
    await user.click(
      checkbox("Vincular Compra B um centavo a menos de 12/11/2026"),
    );
    expect(confirm.hasAttribute("disabled")).toBe(true);

    await user.click(
      checkbox("Vincular Compra B um centavo a menos de 12/11/2026"),
    );
    await user.click(checkbox("Vincular Compra B de 12/11/2026"));
    expect(confirm.hasAttribute("disabled")).toBe(false);
    await user.click(confirm);

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-card-settlements",
        {
          method: "POST",
          body: JSON.stringify({
            settlementEntryId: settlement.id,
            resolution: "LINKED",
            cardEntryIds: [cardEntries[0].id, cardEntries[1].id],
          }),
        },
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Conferência salva.");
  });

  it("shows the GET error and offers retry", async () => {
    const user = userEvent.setup();
    api.request
      .mockRejectedValueOnce(new Error("Falha ao carregar"))
      .mockResolvedValueOnce({ settlements: [], cardEntries: [] });
    renderReview();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Falha ao carregar",
    );
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it("shows a safe GET error and retries after a non-Error rejection", async () => {
    const user = userEvent.setup();
    api.request
      .mockRejectedValueOnce("offline")
      .mockResolvedValueOnce({ settlements: [], cardEntries: [] });
    renderReview();

    expect(
      await screen.findByText(
        "Não foi possível carregar pagamentos para conferência.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it("shows a safe error and retries when the review response has an invalid shape", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({ settlements: undefined, cardEntries: {} })
      .mockResolvedValueOnce({ settlements: [], cardEntries: [] });
    renderReview();

    expect(
      await screen.findByText(
        "Não foi possível carregar pagamentos para conferência.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it("hides write actions in read-only mode", async () => {
    api.request.mockResolvedValue({ settlements: [settlement], cardEntries });
    renderReview(true);
    await screen.findByText("Pagamento fatura cartão");
    expect(
      screen.queryByRole("button", { name: "Não corresponde" }),
    ).toBeNull();
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    expect(
      screen
        .getByRole("checkbox", { name: /Compra A/ })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("does not render when there are no account payments awaiting review", async () => {
    api.request.mockResolvedValue({ settlements: [], cardEntries });
    const { container } = renderReview();

    await waitFor(() =>
      expect(
        screen.queryByRole("status", {
          name: "Carregando pagamentos de fatura",
        }),
      ).toBeNull(),
    );
    expect(container.textContent).toBe("");
  });

  it("allows explicitly marking a payment unrelated and uses safe feedback", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({ settlements: [settlement], cardEntries })
      .mockResolvedValueOnce({ message: "" })
      .mockResolvedValue({ settlements: [], cardEntries });
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(screen.getByRole("button", { name: "Não corresponde" }));

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-card-settlements",
        {
          method: "POST",
          body: JSON.stringify({
            settlementEntryId: settlement.id,
            resolution: "NOT_RELATED",
            cardEntryIds: [],
          }),
        },
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Conferência salva.");
  });

  it("uses the server error message when saving a decision fails", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({ settlements: [settlement], cardEntries })
      .mockRejectedValueOnce(new Error("A conferência foi recusada."));
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(screen.getByRole("button", { name: "Não corresponde" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("A conferência foi recusada."),
    );
  });

  it("shows a safe save error when the request rejects without an Error", async () => {
    const user = userEvent.setup();
    api.request
      .mockResolvedValueOnce({ settlements: [settlement], cardEntries })
      .mockRejectedValueOnce("offline");
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(screen.getByRole("button", { name: "Não corresponde" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a conferência.",
      ),
    );
  });

  it("filters the list, displays missing dates, and reports no matching purchase", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      settlements: [{ ...settlement, actualDate: null, actualAmount: null }],
      cardEntries: [
        {
          ...cardEntries[0],
          actualDate: null,
          actualAmount: null,
          sourceCategory: null,
        },
      ],
    });
    renderReview();

    await screen.findByText("Sem data · R$ 0,00");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    expect(screen.getAllByText("Sem data").length).toBeGreaterThan(0);
    await user.type(
      screen.getByRole("textbox", { name: "Buscar compra do cartão" }),
      "inexistente",
    );

    expect(
      await screen.findByText("Nenhuma compra corresponde à busca."),
    ).toBeTruthy();
    expect(screen.getByText(/Total selecionado:/).textContent).toContain(
      "0,00",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    expect(
      screen
        .getByRole("button", {
          name: "Selecionar compras que esta fatura quitou",
        })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("offers the empty-candidate state when a payment has no card purchases", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({
      settlements: [{ ...settlement, actualDate: null }],
      cardEntries: [],
    });
    renderReview();

    await screen.findByText("Sem data · R$ 100,00");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    expect(
      await screen.findByText(
        "Não há compras de cartão disponíveis para vincular.",
      ),
    ).toBeTruthy();
  });

  it("allows exact-cent reconciliation after a card refund", async () => {
    const user = userEvent.setup();
    const refund = {
      ...cardEntries[1],
      id: "66666666-6666-4666-8666-666666666666",
      description: "Estorno da compra",
      actualAmount: "-10.00",
    };
    api.request
      .mockResolvedValueOnce({
        settlements: [{ ...settlement, actualAmount: "30.00" }],
        cardEntries: [cardEntries[0], refund],
      })
      .mockResolvedValueOnce({ message: "Conferência salva." });
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Vincular Compra A de 10/11/2026",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Vincular Estorno da compra de 12/11/2026",
      }),
    );
    expect(
      screen
        .getByRole("button", { name: "Confirmar vínculo" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("offers pagination after the first 50 purchase candidates", async () => {
    const user = userEvent.setup();
    const manyEntries = Array.from({ length: 51 }, (_, index) => ({
      ...cardEntries[0],
      id: `entry-${index}`,
      description: `Compra ${index}`,
    }));
    api.request.mockResolvedValue({
      settlements: [settlement],
      cardEntries: manyEntries,
    });
    renderReview();

    await screen.findByText("Pagamento fatura cartão");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Mostrar mais compras (50 de 51)",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Mostrar mais compras (50 de 51)" }),
    );
    expect(
      await screen.findByRole("checkbox", {
        name: "Vincular Compra 50 de 10/11/2026",
      }),
    ).toBeTruthy();
  });

  it("disables invoice actions while saving a decision", async () => {
    let finish!: (value: { message: string }) => void;
    api.request
      .mockResolvedValueOnce({ settlements: [settlement], cardEntries })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const user = userEvent.setup();
    renderReview();
    await screen.findByText("Pagamento fatura cartão");
    await user.click(
      screen.getByRole("button", {
        name: "Selecionar compras que esta fatura quitou",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Vincular Compra A de 10/11/2026" }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Vincular Compra B de 12/11/2026",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmar vínculo" }));
    expect(
      screen
        .getByRole("button", { name: "Confirmar vínculo" })
        .hasAttribute("disabled"),
    ).toBe(true);
    finish({ message: "Conferência salva." });
  });
});
