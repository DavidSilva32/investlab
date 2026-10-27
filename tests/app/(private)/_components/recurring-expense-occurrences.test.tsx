// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecurringExpenseOccurrences } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-occurrences";
import type { RecurringExpenseOccurrence } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-occurrences";

const occurrence: RecurringExpenseOccurrence = {
  id: "occurrence-1",
  recurringExpenseId: "expense-1",
  description: "Energia",
  category: "Moradia",
  essential: true,
  dueDate: "2026-10-10",
  expectedAmount: "200.00",
  actualAmount: null,
  previousActualAmount: null,
  previousDueDate: null,
  status: "planned",
};

afterEach(cleanup);

describe("RecurringExpenseOccurrences", () => {
  it("shows an empty state without scheduled due dates", () => {
    render(
      <RecurringExpenseOccurrences
        occurrences={[]}
        savingId={null}
        onRealize={vi.fn()}
      />,
    );
    expect(screen.getByText(/Não há vencimentos previstos/)).toBeTruthy();
  });

  it("shows the dated variation only when a prior realized value exists", () => {
    render(
      <RecurringExpenseOccurrences
        occurrences={[
          {
            ...occurrence,
            actualAmount: "225.00",
            previousActualAmount: "200.00",
            previousDueDate: "2026-09-10",
            status: "realized",
          },
          { ...occurrence, id: "occurrence-2", dueDate: "2026-10-20" },
          {
            ...occurrence,
            id: "occurrence-3",
            dueDate: "2026-10-25",
            actualAmount: "200.00",
            previousActualAmount: "225.00",
            previousDueDate: "2026-09-10",
            status: "realized",
          },
          {
            ...occurrence,
            id: "occurrence-4",
            dueDate: "2026-10-28",
            actualAmount: "200.00",
            previousActualAmount: "200.00",
            previousDueDate: "2026-09-10",
            status: "realized",
          },
        ]}
        savingId={null}
        onRealize={vi.fn()}
      />,
    );

    expect(
      screen.getAllByText(
        /Último valor realizado: R\$\s*200,00 em 10 de setembro de 2026/,
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(/Variação sobre o último realizado: \+R\$\s*25,00/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Variação sobre o último realizado: −R\$\s*25,00/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Variação sobre o último realizado: R\$\s*0,00/),
    ).toBeTruthy();
  });

  it("validates and records a paid amount", async () => {
    const onRealize = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <RecurringExpenseOccurrences
        occurrences={[occurrence]}
        savingId={null}
        onRealize={onRealize}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Registrar valor realizado de Energia",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar valor" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Informe o valor efetivamente pago",
    );
    await user.type(screen.getByLabelText("Valor pago"), "215,90");
    await user.click(screen.getByRole("button", { name: "Salvar valor" }));
    expect(onRealize).toHaveBeenCalledWith(occurrence, 215.9);
  });

  it("cancels value editing and disables save while the occurrence is saving", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RecurringExpenseOccurrences
        occurrences={[{ ...occurrence, category: null }]}
        savingId={null}
        onRealize={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Registrar valor realizado de Energia",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(
      screen.getByRole("button", {
        name: "Registrar valor realizado de Energia",
      }),
    ).toBeTruthy();

    rerender(
      <RecurringExpenseOccurrences
        occurrences={[{ ...occurrence, category: null }]}
        savingId={occurrence.id}
        onRealize={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Registrar valor realizado de Energia",
      }),
    );
    const save = screen.getByRole("button", { name: "Salvando…" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it("preloads a realized amount and keeps editing when realization fails", async () => {
    const realizedOccurrence = {
      ...occurrence,
      actualAmount: "215.90",
      status: "realized" as const,
    };
    const onRealize = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <RecurringExpenseOccurrences
        occurrences={[realizedOccurrence]}
        savingId={null}
        onRealize={onRealize}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Corrigir valor realizado de Energia",
      }),
    );
    expect(
      (screen.getByLabelText("Valor pago") as HTMLInputElement).value,
    ).toBe("215,90");
    await user.click(screen.getByRole("button", { name: "Salvar valor" }));
    expect(onRealize).toHaveBeenCalledWith(realizedOccurrence, 215.9);
    expect(screen.getByLabelText("Valor pago")).toBeTruthy();
  });
});
