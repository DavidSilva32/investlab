"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  DatePickerField,
  getTodayDateIso,
} from "@/components/ui/date-picker-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FinancialCategoryQuickCreateDialog } from "@/app/(private)/financas/_components/financial-category-quick-create-dialog";
import {
  formatAmountInput,
  formatBrazilianAmountValue,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
type Entry = {
  id: string;
  kind: Kind;
  description: string;
  categoryId: string;
  categoryName: string;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
};
type Recurrence = {
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
const frequencies = [
  ["WEEKLY", "Semanal"],
  ["BIWEEKLY", "Quinzenal"],
  ["MONTHLY", "Mensal"],
  ["BIMONTHLY", "A cada dois meses"],
  ["QUARTERLY", "Trimestral"],
  ["SEMIANNUALLY", "Semestral"],
  ["YEARLY", "Anual"],
] as const;

function normalizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function nextDueDate(value: string, frequency: string) {
  const intervals: Record<string, number> = {
    WEEKLY: 7,
    BIWEEKLY: 14,
    MONTHLY: 1,
    BIMONTHLY: 2,
    QUARTERLY: 3,
    SEMIANNUALLY: 6,
    YEARLY: 12,
  };
  const [year, month, day] = value.split("-").map(Number);
  const interval = intervals[frequency] ?? 1;
  if (frequency === "WEEKLY" || frequency === "BIWEEKLY") {
    const date = new Date(Date.UTC(year, month - 1, day + interval));
    return date.toISOString().slice(0, 10);
  }
  const targetMonth = month - 1 + interval;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}
export function FinancialEntryDialog({
  open,
  onOpenChange,
  categories,
  entry,
  onSaved,
  recurrences = [],
  recurrencesLoading = false,
  recurrencesError = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  entry: Entry | null;
  onSaved: () => void;
  recurrences?: Recurrence[];
  recurrencesLoading?: boolean;
  recurrencesError?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "EXPENSE");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "");
  const [expectedAmount, setExpectedAmount] = useState(
    formatBrazilianAmountValue(entry?.expectedAmount ?? ""),
  );
  const [expectedDate, setExpectedDate] = useState(entry?.expectedDate ?? "");
  const [actualAmount, setActualAmount] = useState(
    formatBrazilianAmountValue(entry?.actualAmount ?? ""),
  );
  const [actualDate, setActualDate] = useState(entry?.actualDate ?? "");
  const [busy, setBusy] = useState(false);
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickCategories, setQuickCategories] = useState<Category[]>([]);
  const [createRecurrence, setCreateRecurrence] = useState(false);
  const [frequency, setFrequency] = useState("MONTHLY");
  const [manualNextOccurrence, setManualNextOccurrence] = useState<
    string | null
  >(null);
  const expectedAmountInputRef = useRef<HTMLInputElement>(null);
  const actualAmountInputRef = useRef<HTMLInputElement>(null);
  const expectedSelectionRef = useRef<CurrencyInputSelection | null>(null);
  const actualSelectionRef = useRef<CurrencyInputSelection | null>(null);
  const nextOccurrence =
    manualNextOccurrence ??
    (createRecurrence
      ? nextDueDate(expectedDate || actualDate || getTodayDateIso(), frequency)
      : "");
  const expectedPairValid = Boolean(expectedAmount) === Boolean(expectedDate);
  const actualPairValid = Boolean(actualAmount) === Boolean(actualDate);
  const hasAmount = Boolean(expectedAmount || actualAmount);
  const parsedExpectedAmount = parseBrazilianAmount(expectedAmount);
  const parsedActualAmount = parseBrazilianAmount(actualAmount);
  const expectedAmountValid =
    !expectedAmount ||
    (Number.isFinite(parsedExpectedAmount) && parsedExpectedAmount > 0);
  const actualAmountValid =
    !actualAmount ||
    (Number.isFinite(parsedActualAmount) && parsedActualAmount > 0);
  const available = categories.filter(
    (category) => category.kind === kind && category.active,
  );
  const availableCategories = [
    ...available,
    ...quickCategories.filter(
      (category) =>
        category.kind === kind &&
        category.active &&
        !available.some((existing) => existing.id === category.id),
    ),
  ];
  const duplicateRecurrence = recurrences.find(
    (recurrence) =>
      recurrence.active &&
      recurrence.kind === kind &&
      recurrence.categoryId === categoryId &&
      normalizeDescription(recurrence.description) ===
        normalizeDescription(description),
  );

  useLayoutEffect(() => {
    const fields = [
      [expectedAmountInputRef.current, expectedSelectionRef],
      [actualAmountInputRef.current, actualSelectionRef],
    ] as const;
    for (const [input, selectionRef] of fields) {
      const selection = selectionRef.current;
      if (!input || !selection) continue;
      const resolved = resolveCurrencyInputSelection(input.value, selection);
      input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
      selectionRef.current = null;
    }
  }, [expectedAmount, actualAmount]);

  function handleAmountChange(
    value: string,
    selectionStart: number | null,
    selectionEnd: number | null,
    selectionDirection: "forward" | "backward" | "none" | null,
    setAmount: (value: string) => void,
    selectionRef: React.MutableRefObject<CurrencyInputSelection | null>,
  ) {
    const nextAmount = formatAmountInput(value);
    const start = selectionStart ?? value.length;
    const end = selectionEnd ?? start;
    selectionRef.current = getCurrencyInputSelection(
      value,
      nextAmount,
      start,
      end,
      selectionDirection,
    );
    setAmount(nextAmount);
  }

  function toggleRecurrence(checked: boolean) {
    setCreateRecurrence(checked);
    setManualNextOccurrence(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCreateRecurrence(false);
      setFrequency("MONTHLY");
      setManualNextOccurrence(null);
    }
    onOpenChange(nextOpen);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...(entry ? { id: entry.id } : {}),
        kind,
        description,
        categoryId,
        expectedAmount: expectedAmount ? parsedExpectedAmount : null,
        expectedDate: expectedDate || null,
        actualAmount: actualAmount ? parsedActualAmount : null,
        actualDate: actualDate || null,
      };
      await apiRequest(
        "/api/financial-entries",
        { method: entry ? "PATCH" : "POST", body: JSON.stringify(payload) },
        "Não foi possível salvar o lançamento.",
      );
      if (!entry && createRecurrence) {
        try {
          await apiRequest(
            "/api/financial-recurrences",
            {
              method: "POST",
              body: JSON.stringify({
                kind,
                description: description.trim(),
                categoryId,
                amount: parseBrazilianAmount(expectedAmount || actualAmount),
                frequency,
                firstDueDate: nextOccurrence,
                essential: false,
              }),
            },
            "Não foi possível criar a recorrência.",
          );
          toast.success("Lançamento e recorrência cadastrados.");
        } catch (error) {
          toast.error(
            `O lançamento foi salvo, mas a recorrência não foi criada${error instanceof Error ? `: ${error.message}` : ". Você pode cadastrá-la em Recorrências."}`,
          );
        }
      } else {
        toast.success(
          entry ? "Lançamento atualizado." : "Lançamento cadastrado.",
        );
      }
      onSaved();
      handleOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry ? "Editar lançamento" : "Novo lançamento"}
          </DialogTitle>
          <DialogDescription>
            Registre o previsto, o realizado ou os dois valores com suas datas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Movimento</Label>
              <Select
                value={kind}
                onValueChange={(value: Kind) => {
                  setKind(value);
                  setCategoryId("");
                }}
              >
                <SelectTrigger aria-label="Tipo de lançamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Entrada</SelectItem>
                  <SelectItem value="EXPENSE">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-description">Descrição</Label>
              <Input
                id="entry-description"
                required
                maxLength={120}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="financial-entry-category">Categoria</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-1 py-0 text-xs"
                onClick={() => setQuickCategoryOpen(true)}
              >
                <Plus aria-hidden="true" className="mr-1 size-3.5" />
                Criar categoria
              </Button>
            </div>
            <Select value={categoryId} onValueChange={setCategoryId} required>
              <SelectTrigger
                id="financial-entry-category"
                aria-label="Categoria"
              >
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!entry && (
            <section className="space-y-3 rounded-xl border p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={createRecurrence}
                  onCheckedChange={(checked) =>
                    toggleRecurrence(checked === true)
                  }
                  aria-label="Criar recorrência para este lançamento"
                />
                <span className="space-y-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    Criar recorrência
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Este lançamento será salvo agora. A próxima ocorrência
                    seguirá a data e a periodicidade escolhidas abaixo.
                  </span>
                </span>
              </label>
              {createRecurrence && (
                <div className="space-y-3 pl-7">
                  <div className="space-y-2">
                    <Label>Periodicidade</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger aria-label="Periodicidade da recorrência">
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
                  <DatePickerField
                    id="next-recurrence-date"
                    label="Próxima ocorrência"
                    value={nextOccurrence}
                    onChange={(value) => {
                      setManualNextOccurrence(value);
                    }}
                    required
                  />
                  {recurrencesLoading && (
                    <p role="status" className="text-xs text-muted-foreground">
                      Verificando recorrências existentes…
                    </p>
                  )}
                  {recurrencesError && !recurrencesLoading && (
                    <p
                      role="status"
                      className="text-xs text-amber-700 dark:text-amber-300"
                    >
                      Não foi possível verificar possíveis duplicidades.
                    </p>
                  )}
                  {duplicateRecurrence && !recurrencesLoading && (
                    <p
                      role="status"
                      className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
                    >
                      Já existe uma recorrência ativa parecida:{" "}
                      {duplicateRecurrence.description}. Confira antes de
                      continuar.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">Previsto</p>
              <div className="space-y-2">
                <Label htmlFor="expected-amount">Valor (R$)</Label>
                <Input
                  id="expected-amount"
                  ref={expectedAmountInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={expectedAmount}
                  placeholder="R$ 0,00"
                  onChange={(event) =>
                    handleAmountChange(
                      event.target.value,
                      event.target.selectionStart,
                      event.target.selectionEnd,
                      event.target.selectionDirection,
                      setExpectedAmount,
                      expectedSelectionRef,
                    )
                  }
                />
              </div>
              <DatePickerField
                id="expected-date"
                label="Data prevista"
                value={expectedDate}
                onChange={setExpectedDate}
              />
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm font-medium">Realizado</p>
              <div className="space-y-2">
                <Label htmlFor="actual-amount">Valor (R$)</Label>
                <Input
                  id="actual-amount"
                  ref={actualAmountInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={actualAmount}
                  placeholder="R$ 0,00"
                  onChange={(event) =>
                    handleAmountChange(
                      event.target.value,
                      event.target.selectionStart,
                      event.target.selectionEnd,
                      event.target.selectionDirection,
                      setActualAmount,
                      actualSelectionRef,
                    )
                  }
                />
              </div>
              <DatePickerField
                id="actual-date"
                label="Data realizada"
                value={actualDate}
                onChange={setActualDate}
              />
            </div>
          </div>
          {!expectedAmount && !actualAmount && (
            <p role="alert" className="text-sm text-destructive">
              Informe ao menos um valor e a data correspondente.
            </p>
          )}
          {expectedAmount && !expectedDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe a data prevista para este valor.
            </p>
          )}
          {!expectedAmount && expectedDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe o valor previsto para esta data.
            </p>
          )}
          {actualAmount && !actualDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe a data realizada para este valor.
            </p>
          )}
          {!actualAmount && actualDate && (
            <p role="alert" className="text-sm text-destructive">
              Informe o valor realizado para esta data.
            </p>
          )}
          {!expectedAmountValid && (
            <p role="alert" className="text-sm text-destructive">
              Informe um valor previsto maior que R$ 0,00.
            </p>
          )}
          {!actualAmountValid && (
            <p role="alert" className="text-sm text-destructive">
              Informe um valor realizado maior que R$ 0,00.
            </p>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={
                  busy ||
                  !hasAmount ||
                  !expectedPairValid ||
                  !actualPairValid ||
                  !expectedAmountValid ||
                  !actualAmountValid ||
                  !categoryId ||
                  (createRecurrence && (!nextOccurrence || recurrencesLoading))
                }
              >
                {busy ? "Salvando…" : "Salvar lançamento"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
      <FinancialCategoryQuickCreateDialog
        open={quickCategoryOpen}
        kind={kind}
        onOpenChange={setQuickCategoryOpen}
        onCreated={(category) => {
          setQuickCategories((current) => [...current, category]);
          setCategoryId(category.id);
        }}
      />
    </Dialog>
  );
}
