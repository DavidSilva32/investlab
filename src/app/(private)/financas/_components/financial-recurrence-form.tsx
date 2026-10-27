"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
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

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
export type RecurrenceFormModel = {
  id: string;
  kind: Kind;
  description: string;
  categoryId: string | null;
  amount: string;
  frequency: string;
  firstDueDate: string;
  essential: boolean;
  active: boolean;
};
export type RecurrenceFormValues = {
  id?: string;
  kind: Kind;
  description: string;
  categoryId: string | null;
  amount: number;
  frequency: string;
  firstDueDate: string;
  essential: boolean;
  active?: boolean;
};

const frequencies = [
  ["WEEKLY", "Semanal"],
  ["BIWEEKLY", "Quinzenal"],
  ["MONTHLY", "Mensal"],
  ["BIMONTHLY", "A cada dois meses"],
  ["QUARTERLY", "Trimestral"],
  ["SEMIANNUALLY", "Semestral"],
  ["YEARLY", "Anual"],
] as const;

export function FinancialRecurrenceForm({
  month,
  categories,
  editing,
  onSave,
  onCancelEdit,
}: {
  month: string;
  categories: Category[];
  editing: RecurrenceFormModel | null;
  onSave: (values: RecurrenceFormValues) => Promise<void>;
  onCancelEdit: () => void;
}) {
  const [kind, setKind] = useState<Kind>(editing?.kind ?? "EXPENSE");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [frequency, setFrequency] = useState(editing?.frequency ?? "MONTHLY");
  const [firstDueDate, setFirstDueDate] = useState(
    editing?.firstDueDate ?? `${month}-01`,
  );
  const [essential, setEssential] = useState(editing?.essential ?? false);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave({
        ...(editing ? { id: editing.id, active: editing.active } : {}),
        kind,
        description,
        categoryId: categoryId || null,
        amount: Number(amount),
        frequency,
        firstDueDate,
        essential: kind === "EXPENSE" && essential,
      });
      setDescription("");
      setCategoryId("");
      setAmount("");
      setFrequency("MONTHLY");
      setFirstDueDate(`${month}-01`);
      setEssential(false);
      onCancelEdit();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a recorrência.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="space-y-4 rounded-xl border p-4"
    >
      <h3 className="font-semibold">
        {editing ? "Editar modelo" : "Nova recorrência"}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={kind}
            onValueChange={(value: Kind) => {
              setKind(value);
              setCategoryId("");
              if (value === "INCOME") setEssential(false);
            }}
          >
            <SelectTrigger aria-label="Tipo de recorrência">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INCOME">Entrada</SelectItem>
              <SelectItem value="EXPENSE">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rec-description">Descrição</Label>
          <Input
            id="rec-description"
            required
            maxLength={120}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Categoria</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Categoria da recorrência">
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            {categories
              .filter((category) => category.kind === kind && category.active)
              .map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="rec-amount">Valor esperado (R$)</Label>
          <Input
            id="rec-amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Periodicidade</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger aria-label="Periodicidade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {frequencies.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DatePickerField
        id="rec-first-date"
        label="Primeiro vencimento"
        value={firstDueDate}
        onChange={setFirstDueDate}
        required
      />
      {kind === "EXPENSE" && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={essential}
            onCheckedChange={(value) => setEssential(value === true)}
          />
          Despesa essencial
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancelEdit}>
          Cancelar
        </Button>
        <Button
          disabled={busy || !firstDueDate || !description.trim() || !amount}
        >
          {busy
            ? "Salvando…"
            : editing
              ? "Salvar alterações"
              : "Adicionar recorrência"}
        </Button>
      </div>
    </form>
  );
}
