// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecurringExpenseList } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-list";
import type { RecurringExpense } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-form";

const expense: RecurringExpense = {
  id: "expense-1",
  description: "Aluguel",
  category: "Moradia",
  amount: "550.00",
  frequency: "MONTHLY",
  firstDueDate: "2026-10-05",
  essential: true,
  active: true,
};

afterEach(cleanup);

describe("RecurringExpenseList", () => {
  it("shows an empty state when there are no expenses", () => {
    render(
      <RecurringExpenseList
        expenses={[]}
        updatingId={null}
        onEdit={vi.fn()}
        onToggleActive={vi.fn()}
      />,
    );
    expect(screen.getByText(/Cadastre uma conta recorrente/)).toBeTruthy();
  });

  it("exposes edit and pause actions for an active expense", async () => {
    const onEdit = vi.fn();
    const onToggleActive = vi.fn();
    const user = userEvent.setup();
    render(
      <RecurringExpenseList
        expenses={[expense]}
        updatingId={null}
        onEdit={onEdit}
        onToggleActive={onToggleActive}
      />,
    );
    expect(screen.getByText("R$ 550,00")).toBeTruthy();
    expect(screen.getByText("Essencial")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Editar Aluguel" }));
    await user.click(screen.getByRole("button", { name: "Pausar Aluguel" }));
    expect(onEdit).toHaveBeenCalledWith(expense);
    expect(onToggleActive).toHaveBeenCalledWith(expense);
  });

  it("shows a paused optional expense and disables its action while updating", async () => {
    const pausedExpense: RecurringExpense = {
      ...expense,
      id: "expense-2",
      description: "Streaming",
      category: null,
      frequency: "YEARLY",
      essential: false,
      active: false,
    };
    const onToggleActive = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <RecurringExpenseList
        expenses={[pausedExpense]}
        updatingId={null}
        onEdit={vi.fn()}
        onToggleActive={onToggleActive}
      />,
    );

    expect(screen.getByText("Pausada")).toBeTruthy();
    expect(screen.queryByText("Essencial")).toBeNull();
    expect(screen.getByText(/Todo ano · próximo vencimento/)).toBeTruthy();
    const resume = screen.getByRole("button", { name: "Retomar Streaming" });
    expect((resume as HTMLButtonElement).disabled).toBe(false);
    expect(resume.textContent).toBe("Retomar");
    await user.click(resume);
    expect(onToggleActive).toHaveBeenCalledWith(pausedExpense);

    rerender(
      <RecurringExpenseList
        expenses={[pausedExpense]}
        updatingId="expense-2"
        onEdit={vi.fn()}
        onToggleActive={onToggleActive}
      />,
    );
    const saving = screen.getByRole("button", { name: "Retomar Streaming" });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect(saving.textContent).toBe("Salvando…");
  });
});
