"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatAmountInput,
  formatBrazilianAmountValue,
  parseBrazilianAmount,
} from "@/lib/currency-input";
import type { RecurringExpenseFrequency } from "@/backend/services/recurring-expense-schedule";

export type RecurringExpense = {
  id: string;
  description: string;
  category: string | null;
  amount: string;
  frequency: RecurringExpenseFrequency;
  firstDueDate: string;
  essential: boolean;
  active: boolean;
};

export type RecurringExpenseValues = Omit<
  RecurringExpense,
  "id" | "active" | "amount"
> & { amount: number };

type Props = {
  expense?: RecurringExpense;
  saving: boolean;
  onSave: (values: RecurringExpenseValues) => Promise<boolean>;
  onCancel?: () => void;
};

const frequencyOptions: Array<{
  value: RecurringExpenseFrequency;
  label: string;
}> = [
  { value: "WEEKLY", label: "Toda semana" },
  { value: "BIWEEKLY", label: "A cada duas semanas" },
  { value: "MONTHLY", label: "Todo mês" },
  { value: "BIMONTHLY", label: "A cada dois meses" },
  { value: "QUARTERLY", label: "A cada três meses" },
  { value: "SEMIANNUALLY", label: "A cada seis meses" },
  { value: "YEARLY", label: "Todo ano" },
];

export function RecurringExpenseForm({
  expense,
  saving,
  onSave,
  onCancel,
}: Props) {
  const [description, setDescription] = useState(expense?.description ?? "");
  const [category, setCategory] = useState(expense?.category ?? "");
  const [amount, setAmount] = useState(
    expense ? formatBrazilianAmountValue(expense.amount) : "",
  );
  const [frequency, setFrequency] = useState<RecurringExpenseFrequency | "">(
    expense?.frequency ?? "",
  );
  const [firstDueDate, setFirstDueDate] = useState(expense?.firstDueDate ?? "");
  const [essential, setEssential] = useState(expense?.essential ?? false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseBrazilianAmount(amount);
    if (
      !description.trim() ||
      !frequency ||
      !firstDueDate ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setError("Informe nome, valor, periodicidade e próximo vencimento.");
      return;
    }
    setError(null);
    const saved = await onSave({
      description: description.trim(),
      category: category.trim() || null,
      amount: parsedAmount,
      frequency,
      firstDueDate,
      essential,
    });
    if (saved && !expense) {
      setDescription("");
      setCategory("");
      setAmount("");
      setFrequency("");
      setFirstDueDate("");
      setEssential(false);
    }
  }

  return (
    <section
      aria-labelledby="recurring-expense-form-title"
      className="rounded-xl border bg-card p-4 sm:p-6"
    >
      <header className="mb-5 space-y-1">
        <h2 id="recurring-expense-form-title" className="text-lg font-semibold">
          {expense
            ? "Editar despesa recorrente"
            : "Cadastrar despesa recorrente"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Os valores previstos são separados dos valores realizados.
        </p>
      </header>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="recurring-expense-description">Nome</Label>
          <Input
            id="recurring-expense-description"
            value={description}
            maxLength={120}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Ex.: Aluguel"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recurring-expense-category">
            Categoria (opcional)
          </Label>
          <Input
            id="recurring-expense-category"
            value={category}
            maxLength={80}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex.: Moradia"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recurring-expense-amount">Valor esperado</Label>
          <Input
            id="recurring-expense-amount"
            value={amount}
            onChange={(event) =>
              setAmount(formatAmountInput(event.target.value))
            }
            inputMode="decimal"
            placeholder="R$ 0,00"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recurring-expense-frequency">Periodicidade</Label>
          <Select
            value={frequency}
            onValueChange={(value) =>
              setFrequency(value as RecurringExpenseFrequency)
            }
          >
            <SelectTrigger
              id="recurring-expense-frequency"
              aria-required="true"
            >
              <SelectValue placeholder="Escolha a periodicidade" />
            </SelectTrigger>
            <SelectContent>
              {frequencyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DatePickerField
          id="recurring-expense-first-due-date"
          label="Próximo vencimento"
          value={firstDueDate}
          onChange={setFirstDueDate}
          required
        />
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="recurring-expense-essential"
            checked={essential}
            onCheckedChange={(checked) => setEssential(checked === true)}
          />
          <Label htmlFor="recurring-expense-essential">Despesa essencial</Label>
        </div>
        {error && (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving
              ? "Salvando…"
              : expense
                ? "Salvar alterações"
                : "Salvar despesa"}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar edição
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
