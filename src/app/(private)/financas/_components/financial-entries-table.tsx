"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  MoreHorizontal,
  Pencil,
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
import { getFinancialCategoryIcon } from "@/app/(private)/financas/_components/financial-category-icons";
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
  channel?: "MANUAL" | "ACCOUNT" | "CARD";
  sourceCategory?: string | null;
  cardSettlementStatus?: "AGGREGATE" | "LINKED" | "NOT_RELATED" | null;
  expectedAmount: string | null;
  expectedDate: string | null;
  actualAmount: string | null;
  actualDate: string | null;
};
type TableRow = {
  id: string;
  kind: Kind;
  description: string;
  categoryName: string;
  due: string | null;
  amount: string | null;
  realAmount: string | null;
  realDate: string | null;
  state: "Previsto" | "Realizado";
  source: "Avulso" | "Recorrente";
  categoryId: string;
  entry: FinancialEntryRow;
};

const money = (value: string | null) =>
  value === null ? "Sem registro" : formatCurrency(Number(value));
const dateLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "Sem data";
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
  readOnly,
  onEdit,
  onSaved,
}: {
  entries: FinancialEntryRow[];
  readOnly: boolean;
  onEdit: (entry: FinancialEntryRow) => void;
  onSaved?: () => void;
}) {
  const [rowsToDelete, setRowsToDelete] = useState<TableRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
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
    const tasks = targetRows.map((row) =>
      apiRequest(
        `/api/financial-entries?id=${encodeURIComponent(row.entry.id)}`,
        { method: "DELETE" },
        "Não foi possível excluir o lançamento.",
      ),
    );
    const results = await Promise.allSettled(tasks);
    const failedRowIds = new Set(
      results.flatMap((result, index) =>
        result.status === "rejected" ? [targetRows[index].id] : [],
      ),
    );
    const failedRows = targetRows.filter((row) => failedRowIds.has(row.id));
    const failedTaskCount = results.filter(
      (result) => result.status === "rejected",
    ).length;
    const completedCount = targetRows.length - failedTaskCount;
    setSelectedIds(new Set(failedRows.map((row) => row.id)));
    onSaved?.();
    if (failedRows.length === 0) {
      if (targetRows.length === 1) {
        toast.success("Lançamento excluído.");
      } else {
        toast.success(`${targetRows.length} lançamentos excluídos.`);
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
              : "Não foi possível excluir o lançamento. Tente novamente."
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
  async function saveRealization(
    event: React.FormEvent<HTMLFormElement>,
    row: TableRow,
  ) {
    event.preventDefault();
    setRealizingBusy(true);
    try {
      await apiRequest(
        "/api/financial-entries",
        {
          method: "PATCH",
          body: JSON.stringify({
            id: row.entry.id,
            kind: row.entry.kind,
            description: row.entry.description,
            categoryId: row.entry.categoryId,
            recurrenceId: row.entry.recurrenceId ?? null,
            expectedAmount:
              row.entry.expectedAmount === null
                ? null
                : Number(row.entry.expectedAmount),
            expectedDate: row.entry.expectedDate,
            actualAmount: parseBrazilianAmount(realizedAmount),
            actualDate,
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
  ].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const allRowsSelected =
    rows.length > 0 && selectedRows.length === rows.length;
  const someRowsSelected = selectedRows.length > 0 && !allRowsSelected;
  const categoryFilterOptions = Array.from(
    new Set(rows.map((row) => row.categoryName).filter(Boolean)),
  )
    .sort((left, right) => left.localeCompare(right, "pt-BR"))
    .map((category) => ({ value: category, label: category }));
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
            disabled={readOnly}
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
      filterType: "date",
      render: (row) => dateLabel(row.due),
    },
    {
      id: "description",
      label: "Lançamento",
      width: "minmax(180px, 1fr)",
      value: (row) => row.description,
      render: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{row.description}</span>
          {row.entry.sourceCategory && (
            <span className="block text-xs text-muted-foreground">
              Categoria Inter: {row.entry.sourceCategory}
            </span>
          )}
          {row.entry.cardSettlementStatus && (
            <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {row.entry.cardSettlementStatus === "LINKED"
                ? "Fatura vinculada às compras"
                : row.entry.cardSettlementStatus === "NOT_RELATED"
                  ? "Fatura sem vínculo · gasto agregado"
                  : "Fatura · gasto agregado"}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "category",
      label: "Categoria",
      width: "160px",
      value: (row) => row.categoryName,
      filterOptions: categoryFilterOptions,
      render: (row) => {
        const name = row.categoryName;
        const Icon = getFinancialCategoryIcon(name);
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
      label: "Registro",
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
      id: "channel",
      label: "Canal",
      width: "115px",
      value: (row) => row.entry.channel ?? "MANUAL",
      render: (row) =>
        row.entry.channel === "CARD"
          ? "Cartão"
          : row.entry.channel === "ACCOUNT"
            ? "Conta"
            : "Manual",
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
      filterable: false,
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
      filterable: false,
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
                {rowsToDelete.length} lançamento(s) serão excluídos.
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
      <Dialog
        open={Boolean(realizing)}
        onOpenChange={(open) => !open && setRealizing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar realização</DialogTitle>
            <DialogDescription>
              {realizing?.description} · previsão{" "}
              {dateLabel(realizing?.due ?? null)}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void saveRealization(event, realizing!)}
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
