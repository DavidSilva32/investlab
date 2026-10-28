"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ListChecks,
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
  onSaved,
}: {
  entries: FinancialEntryRow[];
  occurrences: OccurrenceRow[];
  readOnly: boolean;
  onEdit: (entry: FinancialEntryRow) => void;
  onSaved?: () => void;
}) {
  const [entriesToDelete, setEntriesToDelete] = useState<FinancialEntryRow[]>(
    [],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
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

  function toggleEntry(entry: FinancialEntryRow, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(entry.id);
      else next.delete(entry.id);
      return next;
    });
  }

  function toggleAllEntries() {
    setSelectedIds(
      allEntriesSelected
        ? new Set()
        : new Set(entries.map((entry) => entry.id)),
    );
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
        if (readOnly || row.source === "Recorrente") return null;
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
                      variant="outline"
                      size="icon"
                      aria-label={
                        allEntriesSelected
                          ? "Desmarcar todos os lançamentos avulsos do mês"
                          : "Selecionar todos os lançamentos avulsos do mês"
                      }
                      aria-pressed={allEntriesSelected}
                      onClick={toggleAllEntries}
                    >
                      <ListChecks aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {allEntriesSelected
                      ? "Desmarcar todos os lançamentos avulsos do mês"
                      : "Selecionar todos os lançamentos avulsos do mês"}
                  </TooltipContent>
                </Tooltip>
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
    </>
  );
}
