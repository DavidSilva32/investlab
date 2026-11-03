"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  MoreHorizontal,
  Pencil,
  CircleStop,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api-client";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import {
  formatAmountInput,
  formatBrazilianAmountValue,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";
import {
  DatePickerField,
  getTodayDateIso,
} from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Kind = "INCOME" | "EXPENSE";
export type FinancialEntryRow = {
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
type OccurrenceRow = {
  id: string;
  recurrenceId?: string;
  kind: Kind;
  description: string;
  category: string | null;
  dueDate: string;
  expectedAmount: string | null;
  actualAmount: string | null;
  actualDate: string | null;
  status: "planned" | "realized";
};
type TableRow = {
  id: string;
  kind: Kind;
  description: string;
  categoryName?: string;
  category?: string | null;
  due: string | null;
  amount: string | null;
  realAmount: string | null;
  realDate: string | null;
  state: "Previsto" | "Realizado";
} & (
  | {
      source: "Avulso";
      categoryId: string;
      entry: FinancialEntryRow;
    }
  | {
      source: "Recorrente";
      recurrenceId?: string;
    }
);

const money = (value: string | null) =>
  value === null ? "Sem registro" : formatCurrency(Number(value));
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "Sem data";

export function FinancialEntriesTable({
  entries,
  occurrences,
  readOnly,
  onEdit,
  onEditRecurrence,
  onSaved,
}: {
  entries: FinancialEntryRow[];
  occurrences: OccurrenceRow[];
  readOnly: boolean;
  onEdit: (entry: FinancialEntryRow) => void;
  onEditRecurrence?: (recurrenceId: string) => void;
  onSaved?: () => void;
}) {
  const [entriesToDelete, setEntriesToDelete] = useState<FinancialEntryRow[]>(
    [],
  );
  const [recurrenceToEnd, setRecurrenceToEnd] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [endingRecurrence, setEndingRecurrence] = useState(false);
  const [realizing, setRealizing] = useState<TableRow | null>(null);
  const [realizedAmount, setRealizedAmount] = useState("");
  const [actualDate, setActualDate] = useState("");
  const [realizingBusy, setRealizingBusy] = useState(false);
  const realizedInputRef = useRef<HTMLInputElement>(null);
  const realizedSelectionRef = useRef<CurrencyInputSelection | null>(null);
  useLayoutEffect(() => {
    const input = realizedInputRef.current;
    const selection = realizedSelectionRef.current;
    if (!input || !selection) return;
    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    realizedSelectionRef.current = null;
  }, [realizedAmount]);
  async function deleteEntries(targetEntries: FinancialEntryRow[]) {
    setDeleting(true);
    const results = await Promise.allSettled(
      targetEntries.map(
        async (entry) =>
          await apiRequest(
            `/api/financial-entries?id=${encodeURIComponent(entry.id)}`,
            { method: "DELETE" },
            "Não foi possível excluir o lançamento.",
          ),
      ),
    );
    const failedEntries = targetEntries.filter(
      (_, index) => results[index].status === "rejected",
    );
    const deletedEntries = targetEntries.length - failedEntries.length;
    setSelectedIds(new Set(failedEntries.map((entry) => entry.id)));
    onSaved?.();
    if (failedEntries.length === 0) {
      toast.success(
        targetEntries.length === 1
          ? "Lançamento excluído."
          : `${deletedEntries} lançamentos excluídos.`,
      );
      setEntriesToDelete([]);
    } else {
      const deletedMessage =
        deletedEntries === 1
          ? "1 lançamento excluído"
          : `${deletedEntries} lançamentos excluídos`;
      const failedMessage =
        failedEntries.length === 1
          ? "1 não pôde ser excluído"
          : `${failedEntries.length} não puderam ser excluídos`;
      toast.error(
        deletedEntries > 0
          ? `${deletedMessage}; ${failedMessage}. Tente novamente.`
          : failedEntries.length === 1
            ? results[0].status === "rejected" &&
              results[0].reason instanceof Error
              ? results[0].reason.message
              : "Não foi possível excluir o lançamento. Tente novamente."
            : `Não foi possível excluir ${failedEntries.length} lançamentos. Tente novamente.`,
      );
      setEntriesToDelete(failedEntries);
    }
    setDeleting(false);
  }
  const selectedEntries = entries.filter((entry) => selectedIds.has(entry.id));
  const allEntriesSelected =
    entries.length > 0 && selectedEntries.length === entries.length;
  const someEntriesSelected = selectedEntries.length > 0 && !allEntriesSelected;

  function toggleEntry(entry: FinancialEntryRow, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
  }

  async function endRecurrence() {
    if (!recurrenceToEnd) return;
    setEndingRecurrence(true);
    try {
      const result = await apiRequest<{ action: "deleted" | "ended" }>(
        `/api/financial-recurrences?id=${encodeURIComponent(recurrenceToEnd)}`,
        { method: "DELETE" },
        "Não foi possível encerrar a recorrência.",
      );
      toast.success(
        result.action === "deleted"
          ? "Recorrência excluída."
          : "Recorrência encerrada. O histórico foi mantido.",
      );
      setRecurrenceToEnd(null);
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar a recorrência.",
      );
    } finally {
      setEndingRecurrence(false);
    }
  }
  function openRealization(row: TableRow) {
    setRealizing(row);
    setRealizedAmount(
      formatBrazilianAmountValue(row.realAmount ?? row.amount ?? ""),
    );
    setActualDate(row.realDate ?? getTodayDateIso());
  }
  function handleRealizedAmountChange(
    value: string,
    selectionStart: number | null,
    selectionEnd: number | null,
    selectionDirection: "forward" | "backward" | "none" | null,
  ) {
    const nextAmount = formatAmountInput(value);
    const start = selectionStart ?? value.length;
    realizedSelectionRef.current = getCurrencyInputSelection(
      value,
      nextAmount,
      start,
      selectionEnd ?? start,
      selectionDirection,
    );
    setRealizedAmount(nextAmount);
  }
  async function saveRealization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !realizing ||
      realizing.source !== "Recorrente" ||
      !realizing.recurrenceId ||
      !realizing.due
    )
      return;
    setRealizingBusy(true);
    try {
      await apiRequest(
        "/api/financial-recurrences/occurrences",
        {
          method: "PUT",
          body: JSON.stringify({
            recurrenceId: realizing.recurrenceId,
            dueDate: realizing.due,
            actualDate,
            actualAmount: parseBrazilianAmount(realizedAmount),
          }),
        },
        "Não foi possível registrar a realização.",
      );
      toast.success("Realização registrada.");
      setRealizing(null);
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a realização.",
      );
    } finally {
      setRealizingBusy(false);
    }
  }
  const rows: TableRow[] = [
    ...entries.map((entry) => ({
      ...entry,
      entry,
      source: "Avulso" as const,
      due: entry.expectedDate ?? entry.actualDate,
      amount: entry.expectedAmount,
      realAmount: entry.actualAmount,
      realDate: entry.actualDate,
      state:
        entry.actualAmount === null
          ? ("Previsto" as const)
          : ("Realizado" as const),
    })),
    ...occurrences.map((item) => ({
      ...item,
      source: "Recorrente" as const,
      due: item.dueDate,
      amount: item.expectedAmount,
      realAmount: item.actualAmount,
      realDate: item.actualDate,
      state:
        item.status === "realized"
          ? ("Realizado" as const)
          : ("Previsto" as const),
    })),
  ].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const columns: PortfolioTableColumn<TableRow>[] = [
    {
      id: "selection",
      label: "",
      width: "48px",
      className: "text-center",
      sortable: false,
      header: (
        <div className="flex justify-center">
          <Checkbox
            checked={
              allEntriesSelected
                ? true
                : someEntriesSelected
                  ? "indeterminate"
                  : false
            }
            disabled={readOnly || entries.length === 0}
            aria-label={
              allEntriesSelected
                ? "Desmarcar todos os lançamentos avulsos do mês"
                : "Selecionar todos os lançamentos avulsos do mês"
            }
            onCheckedChange={(checked) =>
              setSelectedIds(
                checked === true
                  ? new Set(entries.map((entry) => entry.id))
                  : new Set(),
              )
            }
          />
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.source === "Avulso" && selectedIds.has(row.id)}
            disabled={readOnly || row.source !== "Avulso"}
            aria-label={`Selecionar ${row.description}`}
            onCheckedChange={
              row.source === "Avulso"
                ? (checked) => toggleEntry(row.entry, checked === true)
                : undefined
            }
          />
        </div>
      ),
    },
    {
      id: "due",
      label: "Data",
      width: "110px",
      value: (row) => row.due,
      render: (row) => dateLabel(row.due),
    },
    {
      id: "description",
      label: "Lançamento",
      width: "minmax(180px, 1fr)",
      value: (row) => row.description,
      render: (row) => (
        <div className="min-w-0">
          <span className="block truncate font-medium">{row.description}</span>
          <span className="text-xs text-muted-foreground">
            {row.source} · {row.categoryName ?? row.category ?? "Sem categoria"}
          </span>
        </div>
      ),
    },
    {
      id: "kind",
      label: "Tipo",
      width: "110px",
      value: (row) => row.kind,
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.kind === "INCOME" ? (
            <ArrowUp
              className="size-4 text-status-success"
              aria-hidden="true"
            />
          ) : (
            <ArrowDown
              className="size-4 text-status-danger"
              aria-hidden="true"
            />
          )}
          <span
            className={
              row.kind === "INCOME"
                ? "text-status-success"
                : "text-status-danger"
            }
          >
            {row.kind === "INCOME" ? "Entrada" : "Saída"}
          </span>
        </span>
      ),
    },
    {
      id: "amount",
      label: "Previsto",
      width: "130px",
      value: (row) => (row.amount === null ? null : Number(row.amount)),
      render: (row) => money(row.amount),
    },
    {
      id: "state",
      label: "Situação",
      width: "120px",
      value: (row) => row.state,
      render: (row) => (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
          {row.state}
        </span>
      ),
    },
    {
      id: "realized",
      label: "Realizado",
      width: "150px",
      value: (row) => (row.realAmount === null ? null : Number(row.realAmount)),
      render: (row) =>
        row.realAmount ? (
          <span>
            {money(row.realAmount)}
            <span className="ml-1 block text-xs text-muted-foreground">
              {dateLabel(row.realDate)}
            </span>
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      label: "",
      width: "90px",
      sortable: false,
      render: (row) => {
        if (readOnly) return null;
        if (row.source === "Recorrente") {
          const recurrenceId = row.recurrenceId;
          if (!recurrenceId) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Ações para ${row.description} em ${dateLabel(row.due)}`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEditRecurrence && (
                  <DropdownMenuItem
                    onSelect={() => onEditRecurrence(recurrenceId)}
                  >
                    <Pencil aria-hidden="true" /> Editar recorrência
                  </DropdownMenuItem>
                )}
                {(row.state === "Previsto" ||
                  (row.realAmount !== null && row.realDate === null)) && (
                  <DropdownMenuItem onSelect={() => openRealization(row)}>
                    <CalendarCheck aria-hidden="true" />
                    {row.state === "Previsto"
                      ? "Registrar realizado"
                      : "Informar data realizada"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-status-danger focus:text-status-danger"
                  onSelect={() => setRecurrenceToEnd(recurrenceId)}
                >
                  <CircleStop aria-hidden="true" /> Excluir recorrência
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Ações para ${row.description}`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(row.entry)}>
                <Pencil aria-hidden="true" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-status-danger focus:text-status-danger"
                onSelect={() => setEntriesToDelete([row.entry])}
              >
                <Trash2 aria-hidden="true" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <>
      <PortfolioTable
        columns={columns}
        rows={rows}
        emptyMessage="Nenhum lançamento ou vencimento neste mês."
        initialSort={{ id: "due", direction: "asc" }}
        toolbar={
          !readOnly && entries.length > 0 ? (
            <TooltipProvider>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  aria-live="polite"
                  className="text-sm text-muted-foreground"
                >
                  {selectedEntries.length} selecionado(s)
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label={`Excluir selecionados (${selectedEntries.length})`}
                      disabled={selectedEntries.length === 0 || deleting}
                      onClick={() => setEntriesToDelete(selectedEntries)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Excluir selecionados ({selectedEntries.length})
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : null
        }
      />
      {entriesToDelete.length > 0 && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setEntriesToDelete([])}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {entriesToDelete.length === 1
                  ? "Excluir lançamento?"
                  : `Excluir ${entriesToDelete.length} lançamentos?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação excluirá {entriesToDelete.length} lançamento
                {entriesToDelete.length === 1 ? "" : "s"}. As ocorrências
                geradas por recorrências permanecem inalteradas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-status-danger text-white hover:bg-status-danger/90"
                onClick={(event) => {
                  event.preventDefault();
                  void deleteEntries(entriesToDelete);
                }}
              >
                {deleting
                  ? "Excluindo…"
                  : entriesToDelete.length === 1
                    ? "Excluir lançamento"
                    : `Excluir ${entriesToDelete.length} lançamentos`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <AlertDialog
        open={Boolean(recurrenceToEnd)}
        onOpenChange={(open) => !open && setRecurrenceToEnd(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Sem valores realizados, a recorrência será excluída. Se houver
              histórico realizado, ela será encerrada para parar as próximas
              previsões e manter esse histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endingRecurrence}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={endingRecurrence}
              onClick={(event) => {
                event.preventDefault();
                void endRecurrence();
              }}
            >
              {endingRecurrence ? "Removendo…" : "Excluir recorrência"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={Boolean(realizing)}
        onOpenChange={(open) => !open && setRealizing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar realização</DialogTitle>
            <DialogDescription>
              {realizing?.description} · vencimento{" "}
              {dateLabel(realizing?.due ?? null)}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void saveRealization(event)}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="recurring-realized-amount">
                Valor realizado (R$)
              </Label>
              <Input
                id="recurring-realized-amount"
                ref={realizedInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                value={realizedAmount}
                onChange={(event) =>
                  handleRealizedAmountChange(
                    event.target.value,
                    event.target.selectionStart,
                    event.target.selectionEnd,
                    event.target.selectionDirection,
                  )
                }
              />
            </div>
            <DatePickerField
              id="recurring-realized-date"
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
              <Button
                disabled={
                  realizingBusy ||
                  !actualDate ||
                  !Number.isFinite(parseBrazilianAmount(realizedAmount)) ||
                  parseBrazilianAmount(realizedAmount) <= 0
                }
              >
                {realizingBusy ? "Salvando…" : "Salvar realização"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
