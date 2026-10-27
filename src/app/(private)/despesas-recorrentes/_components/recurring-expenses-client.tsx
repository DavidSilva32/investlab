"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  RecurringExpenseForm,
  type RecurringExpense,
  type RecurringExpenseValues,
} from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-form";
import { RecurringExpenseList } from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-list";
import {
  RecurringExpenseOccurrences,
  type RecurringExpenseOccurrence,
} from "@/app/(private)/despesas-recorrentes/_components/recurring-expense-occurrences";

type Overview = {
  month: string;
  expenses: RecurringExpense[];
  occurrences: RecurringExpenseOccurrence[];
};

const expenseLoadFallback =
  "Não foi possível carregar as despesas recorrentes.";
const expenseSaveFallback = "Não foi possível salvar a despesa recorrente.";

function amount(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function monthKey(date: Date) {
  return format(date, "yyyy-MM");
}

function currentMonthKey() {
  return monthKey(new Date());
}

function shiftMonth(value: string, delta: number) {
  const date = parse(value, "yyyy-MM", new Date());
  return monthKey(addMonths(date, delta));
}

function monthLabel(value: string) {
  return format(parse(value, "yyyy-MM", new Date()), "MMMM yyyy", {
    locale: ptBR,
  });
}

function safeErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function RecurringExpensesClient() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonthKey);
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(
    null,
  );
  const [formVersion, setFormVersion] = useState(0);
  const [savingExpense, setSavingExpense] = useState(false);
  const [updatingExpenseId, setUpdatingExpenseId] = useState<string | null>(
    null,
  );
  const [savingOccurrenceId, setSavingOccurrenceId] = useState<string | null>(
    null,
  );

  const overviewQuery = useQuery({
    queryKey: ["recurring-expenses", month],
    queryFn: () =>
      apiRequest<Overview>(
        `/api/recurring-expenses?month=${month}`,
        undefined,
        expenseLoadFallback,
      ),
  });

  async function refreshOverview() {
    await queryClient.invalidateQueries({ queryKey: ["recurring-expenses"] });
  }

  async function saveExpense(values: RecurringExpenseValues) {
    setSavingExpense(true);
    try {
      const payload = {
        ...(editingExpense ? { id: editingExpense.id } : {}),
        ...values,
        ...(editingExpense ? { active: editingExpense.active } : {}),
      };
      await apiRequest(
        "/api/recurring-expenses",
        {
          method: editingExpense ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
        expenseSaveFallback,
      );
      toast.success(
        editingExpense
          ? "Despesa recorrente atualizada."
          : "Despesa recorrente cadastrada.",
      );
      setEditingExpense(null);
      setFormVersion((current) => current + 1);
      await refreshOverview();
      return true;
    } catch (error) {
      toast.error(safeErrorMessage(error, expenseSaveFallback));
      return false;
    } finally {
      setSavingExpense(false);
    }
  }

  async function toggleExpense(expense: RecurringExpense) {
    setUpdatingExpenseId(expense.id);
    try {
      await apiRequest(
        "/api/recurring-expenses",
        {
          method: "PATCH",
          body: JSON.stringify({
            id: expense.id,
            description: expense.description,
            category: expense.category,
            amount: Number(expense.amount),
            frequency: expense.frequency,
            firstDueDate: expense.firstDueDate,
            essential: expense.essential,
            active: !expense.active,
          }),
        },
        expenseSaveFallback,
      );
      toast.success(
        expense.active
          ? "Despesa recorrente pausada."
          : "Despesa recorrente retomada.",
      );
      await refreshOverview();
    } catch (error) {
      toast.error(safeErrorMessage(error, expenseSaveFallback));
    } finally {
      setUpdatingExpenseId(null);
    }
  }

  async function realizeOccurrence(
    occurrence: RecurringExpenseOccurrence,
    actualAmount: number,
  ) {
    setSavingOccurrenceId(occurrence.id);
    try {
      await apiRequest(
        "/api/recurring-expenses/occurrences",
        {
          method: "PUT",
          body: JSON.stringify({
            recurringExpenseId: occurrence.recurringExpenseId,
            dueDate: occurrence.dueDate,
            actualAmount,
          }),
        },
        "Não foi possível registrar o valor realizado.",
      );
      toast.success("Valor realizado registrado.");
      await refreshOverview();
      return true;
    } catch (error) {
      toast.error(
        safeErrorMessage(
          error,
          "Não foi possível registrar o valor realizado.",
        ),
      );
      return false;
    } finally {
      setSavingOccurrenceId(null);
    }
  }

  const overview = overviewQuery.data;
  const plannedTotal = overview
    ? overview.occurrences.reduce(
        (total, occurrence) => total + Number(occurrence.expectedAmount),
        0,
      )
    : 0;
  const realizedTotal = overview
    ? overview.occurrences.reduce(
        (total, occurrence) =>
          total +
          (occurrence.actualAmount ? Number(occurrence.actualAmount) : 0),
        0,
      )
    : 0;

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Contas que se repetem</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Veja os próximos vencimentos e registre o valor pago. Estas
            previsões consideram apenas as despesas recorrentes cadastradas.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ver mês anterior"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <p
            className="min-w-36 text-center font-medium capitalize"
            aria-live="polite"
          >
            {monthLabel(month)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Ver próximo mês"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </section>

      {overviewQuery.isPending ? (
        <div
          className="grid gap-4 sm:grid-cols-2"
          role="status"
          aria-label="Carregando despesas recorrentes"
        >
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted sm:col-span-2" />
        </div>
      ) : overviewQuery.isError ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="font-medium">
            Não foi possível carregar os vencimentos.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tente carregar os dados novamente.
          </p>
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={() => void overviewQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </section>
      ) : overview ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                Previsto em despesas recorrentes
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {amount(plannedTotal)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apenas vencimentos das despesas ativas cadastradas.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                Realizado registrado
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {amount(realizedTotal)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Valores informados por você para este mês.
              </p>
            </div>
          </section>

          <RecurringExpenseOccurrences
            occurrences={overview.occurrences}
            savingId={savingOccurrenceId}
            onRealize={realizeOccurrence}
          />

          <RecurringExpenseForm
            key={editingExpense?.id ?? formVersion}
            expense={editingExpense ?? undefined}
            saving={savingExpense}
            onSave={saveExpense}
            onCancel={
              editingExpense ? () => setEditingExpense(null) : undefined
            }
          />
          <RecurringExpenseList
            expenses={overview.expenses}
            updatingId={updatingExpenseId}
            onEdit={setEditingExpense}
            onToggleActive={(expense) => void toggleExpense(expense)}
          />
        </>
      ) : null}
    </div>
  );
}
