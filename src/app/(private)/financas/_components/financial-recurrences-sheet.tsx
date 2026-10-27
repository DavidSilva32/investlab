"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  FinancialRecurrenceForm,
  type RecurrenceFormValues,
  type RecurrenceFormModel,
} from "@/app/(private)/financas/_components/financial-recurrence-form";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DatePickerField,
  getTodayDateIso,
} from "@/components/ui/date-picker-field";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Kind = "INCOME" | "EXPENSE";
type Category = { id: string; kind: Kind; name: string; active: boolean };
type Occurrence = {
  id: string;
  recurrenceId: string;
  kind: Kind;
  description: string;
  category: string | null;
  essential: boolean;
  dueDate: string;
  expectedAmount: string | null;
  actualAmount: string | null;
  actualDate: string | null;
  status: "planned" | "realized";
};
type Recurrence = RecurrenceFormModel;
type RecurrenceOverview = {
  recurrences: Recurrence[];
  recurrenceOccurrences: Occurrence[];
};
const money = (value: string | null) =>
  value === null ? "Sem registro" : formatCurrency(Number(value));
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "Sem data";
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
const frequencyLabel = (frequency: string) =>
  ({
    WEEKLY: "Semanal",
    BIWEEKLY: "Quinzenal",
    MONTHLY: "Mensal",
    BIMONTHLY: "A cada dois meses",
    QUARTERLY: "Trimestral",
    SEMIANNUALLY: "Semestral",
    YEARLY: "Anual",
  })[frequency] ?? "Periodicidade cadastrada";
export function FinancialRecurrencesSheet({
  open,
  onOpenChange,
  month,
  data,
  loading,
  error,
  retry,
  categories,
  onSaved,
  readOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  data?: RecurrenceOverview;
  loading: boolean;
  error: string | null;
  retry: () => void;
  categories: Category[];
  onSaved: () => void;
  readOnly: boolean;
}) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [realizing, setRealizing] = useState<Occurrence | null>(null);
  const [realizedAmount, setRealizedAmount] = useState("");
  const [actualDate, setActualDate] = useState("");
  const occurrences = data?.recurrenceOccurrences ?? [];
  function startNewRecurrence() {
    setEditing(null);
    setFormVersion((version) => version + 1);
    setFormOpen(true);
  }
  function startEditingRecurrence(item: Recurrence) {
    setEditing(item);
    setFormOpen(true);
  }
  async function saveRecurrence(values: RecurrenceFormValues) {
    await apiRequest(
      "/api/financial-recurrences",
      { method: values.id ? "PATCH" : "POST", body: JSON.stringify(values) },
      "Não foi possível salvar a recorrência.",
    );
    toast.success(
      values.id ? "Recorrência atualizada." : "Recorrência cadastrada.",
    );
    setFormOpen(false);
    setEditing(null);
    setFormVersion((version) => version + 1);
    onSaved();
    void client.invalidateQueries({
      queryKey: queryKeys.finances.recurrences(month),
    });
  }
  async function pause(item: Recurrence) {
    try {
      await apiRequest(
        "/api/financial-recurrences",
        {
          method: "PATCH",
          body: JSON.stringify({
            ...item,
            active: !item.active,
            categoryId: item.categoryId,
          }),
        },
        "Não foi possível atualizar a recorrência.",
      );
      toast.success(
        item.active ? "Recorrência pausada." : "Recorrência reativada.",
      );
      onSaved();
      void client.invalidateQueries({
        queryKey: queryKeys.finances.recurrences(month),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a recorrência.",
      );
    }
  }
  async function realize(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!realizing) return;
    setBusy(true);
    try {
      await apiRequest(
        "/api/financial-recurrences/occurrences",
        {
          method: "PUT",
          body: JSON.stringify({
            recurrenceId: realizing.recurrenceId,
            dueDate: realizing.dueDate,
            actualDate,
            actualAmount: Number(realizedAmount),
          }),
        },
        "Não foi possível registrar a realização.",
      );
      toast.success("Realização registrada.");
      setRealizing(null);
      onSaved();
      void client.invalidateQueries({
        queryKey: queryKeys.finances.recurrences(month),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a realização.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) {
          setEditing(null);
          setFormOpen(false);
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>Compromissos recorrentes</SheetTitle>
          <SheetDescription>
            Cadastre entradas e saídas que se repetem. As ocorrências previstas
            aparecem no fluxo do mês.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Modelos cadastrados</h3>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startNewRecurrence}
                >
                  <Plus className="mr-1 size-4" />
                  Novo
                </Button>
              )}
            </div>
            {error ? (
              <div className="rounded-lg border border-destructive/30 p-4">
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={retry}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : loading ? (
              <p
                className="rounded-lg border p-4 text-sm text-muted-foreground"
                role="status"
              >
                Carregando recorrências…
              </p>
            ) : data?.recurrences?.length ? (
              data.recurrences.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.kind === "INCOME" ? "Entrada" : "Saída"} ·{" "}
                      {formatCurrency(Number(item.amount))} ·{" "}
                      {frequencyLabel(item.frequency)}
                      {item.essential ? " · Essencial" : ""}
                      {!item.active ? " · Pausada" : ""}
                    </p>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditingRecurrence(item)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void pause(item)}
                      >
                        {item.active ? "Pausar" : "Reativar"}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum modelo recorrente cadastrado.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold">
              Ocorrências de {monthLabel(month)}
            </h3>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : occurrences.length ? (
              occurrences.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"
                >
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-sm text-muted-foreground">
                      Vence {dateLabel(item.dueDate)} ·{" "}
                      {money(item.expectedAmount)}
                      {item.actualAmount
                        ? ` · Realizado ${money(item.actualAmount)} ${item.actualDate ? `em ${dateLabel(item.actualDate)}` : "(sem data)"}`
                        : ""}
                    </p>
                  </div>
                  {!readOnly &&
                    (item.status === "planned" ||
                      (item.actualAmount !== null &&
                        item.actualDate === null)) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRealizing(item);
                          setRealizedAmount(
                            item.actualAmount ?? item.expectedAmount ?? "",
                          );
                          setActualDate(item.actualDate ?? getTodayDateIso());
                        }}
                      >
                        {item.status === "planned"
                          ? "Registrar realização"
                          : "Informar data realizada"}
                      </Button>
                    )}
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {loading
                  ? "Carregando ocorrências…"
                  : "Nenhuma ocorrência prevista neste mês."}
              </p>
            )}
          </section>
        </div>{" "}
        {!readOnly && (
          <Dialog
            open={formOpen}
            onOpenChange={(value) => {
              setFormOpen(value);
              if (!value) setEditing(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Editar recorrência" : "Nova recorrência"}
                </DialogTitle>
                <DialogDescription>
                  Informe o tipo, valor e periodicidade do compromisso.
                </DialogDescription>
              </DialogHeader>
              <FinancialRecurrenceForm
                key={`${editing?.id ?? "new"}-${formVersion}`}
                month={month}
                categories={categories}
                editing={editing}
                onSave={saveRecurrence}
                onCancelEdit={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
              />
            </DialogContent>
          </Dialog>
        )}
        <Dialog
          open={Boolean(realizing)}
          onOpenChange={(value) => {
            if (!value) setRealizing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar realização</DialogTitle>
              <DialogDescription>
                {realizing?.description} · vencimento{" "}
                {dateLabel(realizing?.dueDate ?? null)}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(event) => void realize(event)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="realized-amount">Valor realizado (R$)</Label>
                <Input
                  id="realized-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={realizedAmount}
                  onChange={(event) => setRealizedAmount(event.target.value)}
                />
              </div>
              <DatePickerField
                id="realized-date"
                label="Data do pagamento/recebimento"
                value={actualDate}
                onChange={setActualDate}
                required
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRealizing(null)}
                >
                  Cancelar
                </Button>
                <Button disabled={busy || !actualDate}>
                  {busy ? "Registrando…" : "Confirmar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
