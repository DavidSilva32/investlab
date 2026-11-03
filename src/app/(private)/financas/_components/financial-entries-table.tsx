"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CarFront,
  CircleEllipsis,
  FolderOpen,
  Gift,
  GraduationCap,
  House,
  Landmark,
  ReceiptText,
  ShieldCheck,
  Utensils,
  WalletCards,
  HeartPulse,
  BriefcaseBusiness,
  PartyPopper,
  MoreHorizontal,
  Pencil,
  CircleStop,
  Trash2,
  type LucideIcon,
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
  recurrenceId?: string | null;
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
      recordType: "entry";
      source: "Avulso" | "Recorrente";
      categoryId: string;
      entry: FinancialEntryRow;
    }
  | {
      recordType: "occurrence";
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
const categoryIcons: Record<string, LucideIcon> = {
  salario: WalletCards,
  "trabalho autonomo": BriefcaseBusiness,
  beneficios: Gift,
  "renda de aluguel": House,
  "outras entradas": CircleEllipsis,
  moradia: House,
  alimentacao: Utensils,
  transporte: CarFront,
  saude: HeartPulse,
  educacao: GraduationCap,
  "contas e servicos": ReceiptText,
  lazer: PartyPopper,
  "impostos e taxas": Landmark,
  seguros: ShieldCheck,
  "outras despesas": CircleEllipsis,
};
const categoryIcon = (name: string) => {
  const normalized = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return categoryIcons[normalized] ?? FolderOpen;
};
const movementFilterOptions = [
  { value: "INCOME", label: "Entrada" },
  { value: "EXPENSE", label: "Saída" },
];
const stateFilterOptions = [
  { value: "Previsto", label: "Previsto" },
  { value: "Realizado", label: "Realizado" },
];
const sourceFilterOptions = [
  { value: "Avulso", label: "Avulso" },
  { value: "Recorrente", label: "Recorrente" },
];

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
  const [rowsToDelete, setRowsToDelete] = useState<TableRow[]>([]);
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
  async function deleteEntries(targetRows: TableRow[]) {
    setDeleting(true);
    const tasks: { rowIds: string[]; run: () => Promise<unknown> }[] = [];
    const recurrenceRows = new Map<string, string[]>();
    targetRows.forEach((row) => {
      if (row.recordType === "entry") {
        tasks.push({
          rowIds: [row.id],
          run: () =>
            apiRequest(
              `/api/financial-entries?id=${encodeURIComponent(row.entry.id)}`,
              { method: "DELETE" },
              "Não foi possível excluir o lançamento.",
            ),
        });
      } else if (row.recurrenceId) {
        recurrenceRows.set(row.recurrenceId, [
          ...(recurrenceRows.get(row.recurrenceId) ?? []),
          row.id,
        ]);
      }
    });
    recurrenceRows.forEach((rowIds, recurrenceId) => {
      tasks.push({
        rowIds,
        run: () =>
          apiRequest<{ action: "deleted" | "ended" }>(
            `/api/financial-recurrences?id=${encodeURIComponent(recurrenceId)}`,
            { method: "DELETE" },
            "Não foi possível remover a recorrência.",
          ),
      });
    });
    const results = await Promise.allSettled(tasks.map(({ run }) => run()));
    const failedRowIds = new Set(
      tasks.flatMap((task, index) =>
        results[index].status === "rejected" ? task.rowIds : [],
      ),
    );
    const failedRows = targetRows.filter((row) => failedRowIds.has(row.id));
    const failedTaskCount = results.filter(
      (result) => result.status === "rejected",
    ).length;
    const completedCount = tasks.length - failedTaskCount;
    setSelectedIds(new Set(failedRows.map((row) => row.id)));
    onSaved?.();
    if (failedRows.length === 0) {
      const recurrenceResults = results.filter(
        (result) =>
          result.status === "fulfilled" &&
          typeof result.value === "object" &&
          result.value !== null &&
          "action" in result.value,
      );
      if (targetRows.length === 1 && targetRows[0].recordType === "entry") {
        toast.success("Lançamento excluído.");
      } else if (targetRows.length === 1 && recurrenceResults.length === 1) {
        const result = recurrenceResults[0];
        const action =
          result.status === "fulfilled" &&
          typeof result.value === "object" &&
          result.value !== null &&
          "action" in result.value
            ? result.value.action
            : "deleted";
        toast.success(
          action === "ended"
            ? "Recorrência encerrada. O histórico foi mantido."
            : "Recorrência excluída.",
        );
      } else {
        const hasRecurrence = recurrenceRows.size > 0;
        toast.success(
          hasRecurrence
            ? `${completedCount} ações concluídas. O histórico realizado das recorrências foi mantido.`
            : `${targetRows.length} lançamentos excluídos.`,
        );
      }
      setRowsToDelete([]);
    } else {
      const failedActionCount = failedRows.length;
      const singleFailure = results.find(
        (result) => result.status === "rejected",
      );
      const failedSummary =
        failedActionCount === 1
          ? "1 registro não pôde ser removido"
          : `${failedActionCount} registros não puderam ser removidos`;
      toast.error(
        completedCount > 0
          ? `${completedCount} ${completedCount === 1 ? "ação concluída" : "ações concluídas"}; ${failedSummary}. Tente novamente.`
          : tasks.length === 1 &&
              singleFailure?.status === "rejected" &&
              targetRows.length === 1
            ? singleFailure.reason instanceof Error
              ? singleFailure.reason.message
              : targetRows[0].recordType === "entry"
                ? "Não foi possível excluir o lançamento. Tente novamente."
                : "Não foi possível remover a recorrência. Tente novamente."
            : `Não foi possível remover ${failedActionCount} registros selecionados. Tente novamente.`,
      );
      setRowsToDelete(failedRows);
    }
    setDeleting(false);
  }
  function toggleRow(row: TableRow, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(row.id);
      else next.delete(row.id);
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
    if (!realizing) return;
    setRealizingBusy(true);
    try {
      if (realizing.recordType === "entry") {
        await apiRequest(
          "/api/financial-entries",
          {
            method: "PATCH",
            body: JSON.stringify({
              id: realizing.entry.id,
              kind: realizing.entry.kind,
              description: realizing.entry.description,
              categoryId: realizing.entry.categoryId,
              recurrenceId: realizing.entry.recurrenceId ?? null,
              expectedAmount:
                realizing.entry.expectedAmount === null
                  ? null
                  : Number(realizing.entry.expectedAmount),
              expectedDate: realizing.entry.expectedDate,
              actualAmount: parseBrazilianAmount(realizedAmount),
              actualDate,
            }),
          },
          "Não foi possível registrar a realização.",
        );
      } else {
        if (!realizing.recurrenceId || !realizing.due) return;
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
      }
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
      recordType: "entry" as const,
      source: entry.recurrenceId
        ? ("Recorrente" as const)
        : ("Avulso" as const),
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
      recordType: "occurrence" as const,
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
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const allRowsSelected =
    rows.length > 0 && selectedRows.length === rows.length;
  const someRowsSelected = selectedRows.length > 0 && !allRowsSelected;
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
              allRowsSelected
                ? true
                : someRowsSelected
                  ? "indeterminate"
                  : false
            }
            disabled={readOnly || rows.length === 0}
            aria-label={
              allRowsSelected
                ? "Desmarcar todos os registros do mês"
                : "Selecionar todos os registros do mês"
            }
            onCheckedChange={(checked) =>
              setSelectedIds(
                checked === true
                  ? new Set(rows.map((row) => row.id))
                  : new Set(),
              )
            }
          />
        </div>
      ),
      render: (row) => (
        <div className="flex justify-center">
          <Checkbox
            checked={selectedIds.has(row.id)}
            disabled={
              readOnly || (row.recordType === "occurrence" && !row.recurrenceId)
            }
            aria-label={`Selecionar ${row.description}`}
            onCheckedChange={(checked) => toggleRow(row, checked === true)}
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
        <span className="block truncate font-medium">{row.description}</span>
      ),
    },
    {
      id: "category",
      label: "Categoria",
      width: "160px",
      value: (row) => row.categoryName ?? row.category ?? "Sem categoria",
      render: (row) => {
        const name = row.categoryName ?? row.category ?? "Sem categoria";
        const Icon = categoryIcon(name);
        return (
          <span className="inline-flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="truncate">{name}</span>
          </span>
        );
      },
    },
    {
      id: "source",
      label: "Origem",
      width: "115px",
      value: (row) => row.source,
      filterOptions: sourceFilterOptions,
      render: (row) => (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
          {row.source}
        </span>
      ),
    },
    {
      id: "kind",
      label: "Tipo",
      width: "110px",
      value: (row) => row.kind,
      filterOptions: movementFilterOptions,
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
      filterOptions: stateFilterOptions,
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
        if (row.recordType === "occurrence") {
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
              {(row.state === "Previsto" ||
                (row.realAmount !== null && row.realDate === null)) && (
                <DropdownMenuItem onSelect={() => openRealization(row)}>
                  <CalendarCheck aria-hidden="true" />
                  {row.state === "Previsto"
                    ? "Registrar realizado"
                    : "Informar data realizada"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onEdit(row.entry)}>
                <Pencil aria-hidden="true" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-status-danger focus:text-status-danger"
                onSelect={() => setRowsToDelete([row])}
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
          !readOnly && rows.length > 0 ? (
            <TooltipProvider>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  aria-live="polite"
                  className="text-sm text-muted-foreground"
                >
                  {selectedRows.length} selecionado(s)
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      aria-label={`Remover selecionados (${selectedRows.length})`}
                      disabled={selectedRows.length === 0 || deleting}
                      onClick={() => setRowsToDelete(selectedRows)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Remover selecionados ({selectedRows.length})
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : null
        }
      />
      {rowsToDelete.length > 0 && (
        <AlertDialog open onOpenChange={(open) => !open && setRowsToDelete([])}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {rowsToDelete.length === 1
                  ? "Remover registro selecionado?"
                  : `Remover ${rowsToDelete.length} registros selecionados?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {
                  rowsToDelete.filter((row) => row.recordType === "entry")
                    .length
                }{" "}
                lançamentos avulsos serão excluídos.{" "}
                {
                  new Set(
                    rowsToDelete.flatMap((row) =>
                      row.recordType === "occurrence" && row.recurrenceId
                        ? [row.recurrenceId]
                        : [],
                    ),
                  ).size
                }{" "}
                modelos recorrentes selecionados serão removidos ou encerrados
                para parar previsões futuras; o histórico realizado será
                preservado.
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
                  void deleteEntries(rowsToDelete);
                }}
              >
                {deleting ? "Removendo…" : "Confirmar remoção"}
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
              {realizing?.description} ·{" "}
              {realizing?.recordType === "entry" ? "previsão" : "vencimento"}{" "}
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
