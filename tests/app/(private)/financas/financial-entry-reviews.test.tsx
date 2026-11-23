// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  apiRequest: (...args: unknown[]) => api.request(...args),
}));
vi.mock("sonner", () => ({ toast: notifications }));

import { FinancialEntryReviews } from "@/app/(private)/financas/_components/financial-entry-reviews";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialEntryReviews", () => {
  it("confirms a suggested transfer only after explicit user action", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    api.request.mockResolvedValue({ message: "Transferência confirmada." });
    render(
      <FinancialEntryReviews
        transfers={[
          {
            entryId: "out",
            relatedEntryId: "in",
            entryDescription: "Pix enviado",
            relatedDescription: "Pix recebido",
            entryAccount: "Inter",
            relatedAccount: "PagBank",
            actualAmount: "100.00",
            entryDate: "2026-10-31",
            relatedDate: "2026-11-01",
          },
        ]}
        reversals={[]}
        readOnly={false}
        onChanged={onChanged}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    expect(
      screen.getByText(/Possível transferência entre suas contas/),
    ).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-entry-relations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            kind: "TRANSFER",
            entryId: "out",
            relatedEntryId: "in",
          }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it("does not render when no movement needs review", () => {
    const { container } = render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[]}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("keeps review actions disabled in read-only mode", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntryReviews
        transfers={[
          {
            entryId: "out",
            relatedEntryId: "in",
            entryDescription: "Pix enviado",
            relatedDescription: "Pix recebido",
            entryAccount: "Inter",
            relatedAccount: "PagBank",
            actualAmount: "100.00",
            entryDate: "2026-10-31",
            relatedDate: "2026-11-01",
          },
        ]}
        reversals={[]}
        readOnly
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    expect(
      (screen.getByRole("button", { name: /Confirmar/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(api.request).not.toHaveBeenCalled();
  });

  it("keeps an unpaired reversal out of income and supports searching an expense", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    api.request.mockResolvedValue({ message: "Estorno vinculado." });
    render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[
          {
            entryId: "refund",
            description: "Estorno compra",
            actualAmount: "15.00",
            actualDate: "2026-11-12",
            candidates: [],
            expenses: [
              {
                entryId: "expense",
                description: "Compra de livro",
                actualDate: "2026-11-01",
                remainingAmount: "30.00",
              },
            ],
          },
        ]}
        readOnly={false}
        onChanged={onChanged}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    expect(screen.getByText(/Sem correspondência sugerida/)).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: /Buscar despesa/ }),
      "livro",
    );
    await user.click(
      screen.getByRole("combobox", { name: /Despesa correspondente/ }),
    );
    await user.click(screen.getByRole("option", { name: /Compra de livro/ }));
    await user.click(screen.getByRole("button", { name: /Vincular estorno/ }));

    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-entry-relations",
        expect.objectContaining({
          body: JSON.stringify({
            kind: "REVERSAL",
            entryId: "refund",
            relatedEntryId: "expense",
          }),
        }),
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it("marks text-supported reversal candidates as possible matches", async () => {
    const user = userEvent.setup();
    render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[
          {
            entryId: "refund",
            description: "Reembolso Mercado Central",
            actualAmount: "15.00",
            actualDate: "2026-11-12",
            candidates: [
              {
                entryId: "expense",
                description: "Compra Mercado Central",
                actualDate: "2026-11-01",
                remainingAmount: "30.00",
              },
            ],
            expenses: [
              {
                entryId: "expense",
                description: "Compra Mercado Central",
                actualDate: "2026-11-01",
                remainingAmount: "30.00",
              },
            ],
          },
        ]}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    await user.click(
      screen.getByRole("combobox", { name: /Despesa correspondente/ }),
    );

    expect(
      screen.getByRole("option", { name: /Possível correspondência/ }),
    ).toBeTruthy();
  });

  it("reports a safe error and keeps pending refunds out of income when no expense is available", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValueOnce(new Error("Não foi possível confirmar."));
    render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[
          {
            entryId: "refund",
            description: "Estorno sem referência",
            actualAmount: "15.00",
            actualDate: "2026-11-12",
            candidates: [],
            expenses: [],
          },
        ]}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    expect(screen.getByText(/Nenhuma despesa realizada anterior/)).toBeTruthy();
    expect(screen.getByText(/fora das entradas/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Não é estorno" }));
    await waitFor(() => expect(notifications.error).toHaveBeenCalledOnce());
  });

  it("lets the user confirm that a pending credit is not a reversal", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    api.request.mockResolvedValue({
      message: "Crédito considerado como entrada.",
    });
    render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[
          {
            entryId: "refund",
            description: "Crédito recebido",
            actualAmount: "8.91",
            actualDate: "2026-11-06",
            candidates: [],
            expenses: [],
          },
        ]}
        readOnly={false}
        onChanged={onChanged}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    await user.click(screen.getByRole("button", { name: "Não é estorno" }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        "/api/financial-entry-relations",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            kind: "REVERSAL_DISMISSED",
            entryId: "refund",
          }),
        }),
      ),
    );
    await api.request.mock.results.at(-1)?.value;
    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        "Crédito considerado como entrada.",
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
  });

  it("uses a fallback success message when the API message is blank", async () => {
    const user = userEvent.setup();
    api.request.mockResolvedValue({ message: "   " });
    render(
      <FinancialEntryReviews
        transfers={[]}
        reversals={[
          {
            entryId: "refund",
            description: "Crédito recebido",
            actualAmount: "8.91",
            actualDate: "2026-11-06",
            candidates: [],
            expenses: [],
          },
        ]}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    await user.click(screen.getByRole("button", { name: "Não é estorno" }));

    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith("Relação confirmada."),
    );
  });

  it("does not expose a non-Error rejection to the user", async () => {
    const user = userEvent.setup();
    api.request.mockRejectedValueOnce({ detail: "internal" });
    render(
      <FinancialEntryReviews
        transfers={[
          {
            entryId: "out",
            relatedEntryId: "in",
            entryDescription: "Pix enviado",
            relatedDescription: "Pix recebido",
            entryAccount: "Inter",
            relatedAccount: "PagBank",
            actualAmount: "100.00",
            entryDate: "2026-10-31",
            relatedDate: "2026-11-01",
          },
        ]}
        reversals={[]}
        readOnly={false}
        onChanged={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Revisar movimentações/ }),
    );
    await user.click(screen.getByRole("button", { name: /Confirmar/ }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        "Não foi possível confirmar a relação.",
      ),
    );
  });
});
