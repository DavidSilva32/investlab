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

  it("shows loading and errors with a retry action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const client = new QueryClient();
    const props = {
      open: true,
      onOpenChange: () => {},
      month: "2026-10",
      data: undefined,
      loading: true,
      error: null,
      retry,
      categories: [],
      onSaved: () => {},
      readOnly: false,
    };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet {...props} />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Carregando recorrências",
    );

    rerender(
      <QueryClientProvider client={client}>
        <FinancialRecurrencesSheet
          {...props}
          loading={false}
          error="Falha ao carregar."
        />
      </QueryClientProvider>,
    );
    expect(
      (await screen.findAllByRole("alert")).some((alert) =>
        alert.textContent?.includes("Falha ao carregar."),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("records an occurrence using separate actual amount and date", async () => {
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
          data={{
            recurrences: [recurrence],
            recurrenceOccurrences: [occurrence],
          }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={onSaved}
          readOnly={false}
        />
      </QueryClientProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Registrar realização" }),
    );
    await user.clear(screen.getByLabelText("Valor realizado (R$)"));
    await user.type(screen.getByLabelText("Valor realizado (R$)"), "575");
    await user.clear(screen.getByLabelText("Data do pagamento/recebimento"));
    await user.type(
      screen.getByLabelText("Data do pagamento/recebimento"),
      "12/10/2026",
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(api.request).toHaveBeenCalledWith(
      "/api/financial-recurrences/occurrences",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          recurrenceId: occurrence.recurrenceId,
          dueDate: occurrence.dueDate,
          actualDate: "2026-10-12",
          actualAmount: 575,
        }),
      }),
      "Não foi possível registrar a realização.",
    );
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("shows recurrence fallbacks and hides mutation actions in support view", () => {
    const paused = { ...recurrence, active: false, frequency: "LEGACY" };
    const realizedWithoutDate = {
      ...occurrence,
      id: "recurrence-id:2026-10-10-realized",
      status: "realized" as const,
      actualAmount: "540.00",
      actualDate: null,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinancialRecurrencesSheet
          open
          onOpenChange={() => {}}
          month="2026-10"
          data={{
            recurrences: [paused],
            recurrenceOccurrences: [realizedWithoutDate],
          }}
          loading={false}
          error={null}
          retry={() => {}}
          categories={[]}
          onSaved={() => {}}
          readOnly
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/Periodicidade cadastrada · Pausada/)).toBeTruthy();
    expect(screen.getByText(/Realizado.*540,00.*sem data/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reativar" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Informar data realizada" }),
    ).toBeNull();
  });
});
