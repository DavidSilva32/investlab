"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmountInput, parseBrazilianAmount } from "@/lib/currency-input";

export type RecurringExpenseOccurrence = {
  id: string;
  recurringExpenseId: string;
  description: string;
  category: string | null;
  essential: boolean;
  dueDate: string;
  expectedAmount: string;
  actualAmount: string | null;
  previousActualAmount: string | null;
  previousDueDate: string | null;
  status: "planned" | "realized";
};

type Props = {
  occurrences: RecurringExpenseOccurrence[];
  savingId: string | null;
  onRealize: (
    occurrence: RecurringExpenseOccurrence,
    actualAmount: number,
  ) => Promise<boolean>;
};

function formatAmount(value: string | null) {
  if (value === null) return "Ainda não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function formatDueDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatVariation(currentAmount: string, previousAmount: string) {
  const variation = Number(currentAmount) - Number(previousAmount);
  const sign = variation > 0 ? "+" : variation < 0 ? "−" : "";
  return `${sign}${new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Math.abs(variation))}`;
}

export function RecurringExpenseOccurrences({
  occurrences,
  savingId,
  onRealize,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function startEditing(occurrence: RecurringExpenseOccurrence) {
    setEditingId(occurrence.id);
    setAmount(
      occurrence.actualAmount
        ? new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(Number(occurrence.actualAmount))
        : "",
    );
    setError(null);
  }

  async function submit(occurrence: RecurringExpenseOccurrence) {
    const parsed = parseBrazilianAmount(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Informe o valor efetivamente pago.");
      return;
    }
    setError(null);
    if (await onRealize(occurrence, parsed)) setEditingId(null);
  }

  if (occurrences.length === 0) {
    return (
      <section
        aria-labelledby="recurring-expense-occurrences-title"
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <h2
          id="recurring-expense-occurrences-title"
          className="text-lg font-semibold"
        >
          Lançamentos previstos
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Não há vencimentos previstos para este mês. Confira as despesas ativas
          e as datas cadastradas.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="recurring-expense-occurrences-title"
      className="rounded-xl border bg-card p-4 sm:p-6"
    >
      <header className="mb-4">
        <h2
          id="recurring-expense-occurrences-title"
          className="text-lg font-semibold"
        >
          Lançamentos previstos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada vencimento aparece uma vez. Registre o valor pago quando souber o
          valor realizado.
        </p>
      </header>
      <ul className="divide-y divide-border">
        {occurrences.map((occurrence) => {
          const editing = editingId === occurrence.id;
          const saving = savingId === occurrence.id;
          return (
            <li
              key={occurrence.id}
              className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{occurrence.description}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${occurrence.status === "realized" ? "bg-status-success/15 text-status-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {occurrence.status === "realized"
                      ? "Realizado"
                      : "Previsto"}
                  </span>
                  {occurrence.essential && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      Essencial
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDueDate(occurrence.dueDate)}
                  {occurrence.category ? ` · ${occurrence.category}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    Previsto: {formatAmount(occurrence.expectedAmount)}
                  </span>
                  <span>
                    Realizado: {formatAmount(occurrence.actualAmount)}
                  </span>
                </div>
                {occurrence.previousActualAmount !== null &&
                  occurrence.previousDueDate !== null && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Último valor realizado:{" "}
                      {formatAmount(occurrence.previousActualAmount)} em{" "}
                      {formatDueDate(occurrence.previousDueDate)}
                      {occurrence.actualAmount !== null && (
                        <span className="block">
                          Variação sobre o último realizado:{" "}
                          {formatVariation(
                            occurrence.actualAmount,
                            occurrence.previousActualAmount,
                          )}
                        </span>
                      )}
                    </p>
                  )}
              </div>
              <div className="sm:justify-self-end">
                {editing ? (
                  <div className="grid gap-2 sm:min-w-64">
                    <Label htmlFor={`realized-amount-${occurrence.id}`}>
                      Valor pago
                    </Label>
                    <Input
                      id={`realized-amount-${occurrence.id}`}
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={amount}
                      onChange={(event) =>
                        setAmount(formatAmountInput(event.target.value))
                      }
                    />
                    {error && (
                      <p className="text-sm text-destructive" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving}
                        onClick={() => void submit(occurrence)}
                      >
                        {saving ? "Salvando…" : "Salvar valor"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant={
                      occurrence.status === "realized" ? "outline" : "secondary"
                    }
                    size="sm"
                    aria-label={
                      occurrence.status === "realized"
                        ? `Corrigir valor realizado de ${occurrence.description}`
                        : `Registrar valor realizado de ${occurrence.description}`
                    }
                    onClick={() => startEditing(occurrence)}
                  >
                    {occurrence.status === "realized"
                      ? "Corrigir valor"
                      : "Registrar valor realizado"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
