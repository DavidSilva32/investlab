// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiRequest: api.request }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        {children}
        <button type="button" onClick={() => onOpenChange(true)}>
          Reportar diálogo aberto
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Fechar diálogo controlado
        </button>
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <section role="dialog" aria-label="Diálogo interno">
      {children}
    </section>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <footer>{children}</footer>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogClose: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

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

function renderSheet() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
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
        onSaved={() => {}}
        readOnly={false}
      />
    </QueryClientProvider>,
  );
}

describe("FinancialRecurrencesSheet controlled dialog callbacks", () => {
  it("preserves the selected model when its edit dialog reports open", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(
      await screen.findByRole("dialog", { name: "Diálogo interno" }),
    ).toBeTruthy();
    expect(screen.getByText("Editar recorrência")).toBeTruthy();
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe(
      "Salário",
    );

    await user.click(
      screen.getByRole("button", { name: "Reportar diálogo aberto" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Diálogo interno" }),
    ).toBeTruthy();
    expect((screen.getByLabelText("Descrição") as HTMLInputElement).value).toBe(
      "Salário",
    );

    await user.click(
      screen.getByRole("button", { name: "Fechar diálogo controlado" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Diálogo interno" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Descrição")).toBeNull();
  });

  it("keeps the selected occurrence open when its realization dialog reports open", async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(
      screen.getByRole("button", { name: "Registrar realização" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Diálogo interno" }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("dialog", { name: "Diálogo interno" })).getByText(
        "Registrar realização",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Aluguel · vencimento/)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Reportar diálogo aberto" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Diálogo interno" }),
    ).toBeTruthy();
    expect(screen.getByText(/Aluguel · vencimento/)).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Fechar diálogo controlado" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Diálogo interno" }),
    ).toBeNull();
  });
});
