"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PortfolioTableColumn<Row> = {
  id: string;
  label: string;
  className?: string;
  width: string;
  value: (row: Row) => string | number | null;
  render: (row: Row) => ReactNode;
};

type Sort = { id: string; direction: "asc" | "desc" };

type PortfolioTableProps<Row extends { id: string }> = {
  columns: PortfolioTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
  initialSort: Sort;
};

const collator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});
const PAGE_SIZE = 10;

export function PortfolioTable<Row extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  initialSort,
}: PortfolioTableProps<Row>) {
  const [sort, setSort] = useState(initialSort);
  const [pagination, setPagination] = useState({ rows, page: 0 });
  if (pagination.rows !== rows) setPagination({ rows, page: 0 });
  const page = pagination.rows === rows ? pagination.page : 0;
  const activeSortColumn =
    columns.find((item) => item.id === sort.id) ?? columns[0];
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftValue = activeSortColumn.value(left);
      const rightValue = activeSortColumn.value(right);
      if (leftValue === rightValue) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const result =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : collator.compare(String(leftValue), String(rightValue));
      return sort.direction === "asc" ? result : -result;
    });
  }, [activeSortColumn, rows, sort]);

  const toggleSort = (id: string) => {
    setPagination({ rows, page: 0 });
    setSort((current) =>
      current.id === id
        ? { id, direction: current.direction === "asc" ? "desc" : "asc" }
        : { id, direction: "asc" },
    );
  };

  if (!rows.length) {
    return (
      <p className="p-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  const pageCount = Math.ceil(sortedRows.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const firstRow = currentPage * PAGE_SIZE + 1;
  const lastRow = Math.min((currentPage + 1) * PAGE_SIZE, sortedRows.length);

  return (
    <Table className="min-w-262.5 table-fixed">
      <colgroup>
        {columns.map((column) => (
          <col key={column.id} style={{ width: column.width }} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {columns.map((column) => {
            const active = activeSortColumn.id === column.id;
            const Icon = active
              ? sort.direction === "asc"
                ? ArrowUp
                : ArrowDown
              : ArrowUpDown;
            return (
              <TableHead
                key={column.id}
                className={cn(column.className, "px-3")}
                aria-sort={
                  active
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort(column.id)}
                  className={cn(
                    "h-auto rounded-sm px-0 py-1 text-left font-normal hover:bg-transparent hover:text-foreground focus-visible:ring-1",
                    column.className?.includes("text-right") && "ml-auto",
                  )}
                >
                  {column.label}
                  <Icon className="size-3.5" aria-hidden="true" />
                </Button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {pageRows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((column) => (
              <TableCell
                key={column.id}
                className={cn(column.className, "px-3")}
              >
                {column.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={columns.length} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Mostrando {firstRow}–{lastRow} de {sortedRows.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Página anterior"
                  onClick={() => setPagination({ rows, page: currentPage - 1 })}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  Anterior
                </Button>
                <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
                  Página {currentPage + 1} de {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Próxima página"
                  onClick={() => setPagination({ rows, page: currentPage + 1 })}
                  disabled={currentPage >= pageCount - 1}
                >
                  Próxima
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
