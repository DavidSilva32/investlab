"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { Button } from "@/components/ui/button";
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
  categoryId?: string;
  categoryName?: string;
  category?: string | null;
  source: "Avulso" | "Recorrente";
  due: string | null;
  amount: string | null;
  realAmount: string | null;
  realDate: string | null;
  state: "Previsto" | "Realizado";
};

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
}: {
  entries: FinancialEntryRow[];
  occurrences: OccurrenceRow[];
  readOnly: boolean;
  onEdit: (entry: FinancialEntryRow) => void;
}) {
  const rows: TableRow[] = [
    ...entries.map((entry) => ({
      ...entry,
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
            <ArrowDown
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ArrowUp
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {row.kind === "INCOME" ? "Entrada" : "Saída"}
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
        if (readOnly || !row.categoryId) return null;
        const entry = entries.find((candidate) => candidate.id === row.id);
        return entry ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit(entry)}>
            Editar
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <PortfolioTable
      columns={columns}
      rows={rows}
      emptyMessage="Nenhum lançamento ou vencimento neste mês."
      initialSort={{ id: "due", direction: "asc" }}
    />
  );
}
