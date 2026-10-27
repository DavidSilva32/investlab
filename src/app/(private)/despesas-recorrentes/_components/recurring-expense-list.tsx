"use client";

import { Button } from "@/components/ui/button";
import type { RecurringExpense } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-form";

type Props = {
  expenses: RecurringExpense[];
  updatingId: string | null;
  onEdit: (expense: RecurringExpense) => void;
  onToggleActive: (expense: RecurringExpense) => void;
};

const frequencyLabels: Record<RecurringExpense["frequency"], string> = {
  WEEKLY: "Toda semana",
  BIWEEKLY: "A cada duas semanas",
  MONTHLY: "Todo mês",
  BIMONTHLY: "A cada dois meses",
  QUARTERLY: "A cada três meses",
  SEMIANNUALLY: "A cada seis meses",
  YEARLY: "Todo ano",
};

function formatAmount(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function formatDueDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function RecurringExpenseList({
  expenses,
  updatingId,
  onEdit,
  onToggleActive,
}: Props) {
  if (expenses.length === 0) {
    return (
      <section
        aria-labelledby="recurring-expense-list-title"
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <h2 id="recurring-expense-list-title" className="text-lg font-semibold">
          Despesas cadastradas
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cadastre uma conta recorrente para visualizar seus próximos
          vencimentos.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="recurring-expense-list-title"
      className="rounded-xl border bg-card p-4 sm:p-6"
    >
      <header className="mb-4">
        <h2 id="recurring-expense-list-title" className="text-lg font-semibold">
          Despesas cadastradas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pausar uma despesa remove os próximos vencimentos previstos e preserva
          os valores já realizados.
        </p>
      </header>
      <ul className="divide-y divide-border">
        {expenses.map((expense) => {
          const updating = updatingId === expense.id;
          return (
            <li
              key={expense.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{expense.description}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {expense.active ? "Ativa" : "Pausada"}
                  </span>
                  {expense.essential && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Essencial
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {expense.category ? `${expense.category} · ` : ""}
                  {frequencyLabels[expense.frequency]} · próximo vencimento{" "}
                  {formatDueDate(expense.firstDueDate)}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {formatAmount(expense.amount)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(expense)}
                  aria-label={`Editar ${expense.description}`}
                >
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={expense.active ? "ghost" : "secondary"}
                  disabled={updating}
                  onClick={() => onToggleActive(expense)}
                  aria-label={`${expense.active ? "Pausar" : "Retomar"} ${expense.description}`}
                >
                  {updating
                    ? "Salvando…"
                    : expense.active
                      ? "Pausar"
                      : "Retomar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
