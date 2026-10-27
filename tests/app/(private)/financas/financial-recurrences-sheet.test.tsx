// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
import { FinancialRecurrencesSheet } from "@/app/(private)/financas/_components/financial-recurrences-sheet";

const occurrence = {
  id: "recurrence-id:2026-10-10",
  recurrenceId: "recurrence-id",
  kind: "EXPENSE" as const,
  description: "Aluguel",
  category: "Moradia",
  essential: true,
  dueDate: "2026-10-10",
  expectedAmount: "550.00",
  actualAmount: null,
  actualDate: null,
  status: "planned" as const,
};
const recurrence = {
  id: "salary-id",
  kind: "INCOME" as const,
  description: "Salário",
  categoryId: null,
  amount: "5000.00",
  frequency: "MONTHLY",
  firstDueDate: "2026-10-05",
  essential: false,
  active: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FinancialRecurrencesSheet", () => {
  it("opens the model form in a dialog only after choosing Novo", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{ recurrences: [], recurrenceOccurrences: [] }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={() => {}}
          readOnly={false}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("dialog", { name: "Nova recorrência" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Novo" }));
    expect(
      await screen.findByRole("dialog", { name: "Nova recorrência" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("dialog", { name: "Nova recorrência" }),
    ).toBeNull();
  });

  it("requires an explicit realized date when recording a due occurrence", async () => {
    const user = userEvent.setup();
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{ recurrences: [], recurrenceOccurrences: [occurrence] }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={() => {}}
          readOnly={false}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Registrar realização" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Registrar realização" }),
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText("Data do pagamento/recebimento")
        .hasAttribute("required"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Confirmar" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("opens the edit dialog and pauses a recurring model through the API", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const client = new QueryClient();
    api.request.mockResolvedValue({});
    render(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{ recurrences: [recurrence], recurrenceOccurrences: [] }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={onSaved}
          readOnly={false}
        />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(
      await screen.findByRole("dialog", { name: "Editar recorrência" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe(
      "Salário",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("dialog", { name: "Editar recorrência" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Pausar" }));
    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-recurrences",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          ...recurrence,
          active: false,
          categoryId: null,
        }),
      }),
      "Não foi possível atualizar a recorrência.",
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
