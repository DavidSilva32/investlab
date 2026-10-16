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
import {
  PortfolioTableFilterBuilder,
  type PortfolioTableFilter,
  type PortfolioTableFilterOption,
} from "@/components/portfolio-table-filter-builder";

type PortfolioTableColumnBase<Row> = {
  id: string;
  label: string;
  className?: string;
  width: string;
  searchValue?: (row: Row) => string | number | null;
  filterOptions?: PortfolioTableFilterOption[];
  render: (row: Row) => ReactNode;
};

export type PortfolioTableColumn<Row> = PortfolioTableColumnBase<Row> &
  (
    | {
        sortable: false;
        value?: (row: Row) => string | number | null;
      }
    | {
        sortable?: true;
        value: (row: Row) => string | number | null;
      }
  );

function isSortableColumn<Row>(
  column: PortfolioTableColumn<Row>,
): column is PortfolioTableColumn<Row> & {
  sortable?: true;
  value: (row: Row) => string | number | null;
} {
  return column.sortable !== false;
}

type Sort = { id: string; direction: "asc" | "desc" };

type PortfolioTableProps<Row extends { id: string }> = {
  columns: PortfolioTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
  initialSort: Sort;
  toolbar?: ReactNode;
  toolbarSummary?: string;
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
  toolbar,
  toolbarSummary,
}: PortfolioTableProps<Row>) {
  const [sort, setSort] = useState(initialSort);
  const [pagination, setPagination] = useState({ rows, page: 0 });
  const [appliedFilters, setAppliedFilters] = useState<PortfolioTableFilter[]>(
    [],
  );
  if (pagination.rows !== rows) setPagination({ rows, page: 0 });
  const page = pagination.rows === rows ? pagination.page : 0;
  const sortableColumns = columns.filter(isSortableColumn);
  const activeSortColumn =
    sortableColumns.find((item) => item.id === sort.id) ?? sortableColumns[0];
  const filterColumns = columns.filter(isSortableColumn).map((column) => ({
    id: column.id,
    label: column.label,
    options: column.filterOptions,
  }));
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return appliedFilters.every((filter) => {
        const column = columns.find((item) => item.id === filter.columnId);
        if (!column || !isSortableColumn(column)) return false;
        const rowValue = (column.searchValue ?? column.value)(row);
        if (rowValue === null) return false;
        if (column.filterOptions) return String(rowValue) === filter.value;
        const valueTerms = normalize(filter.value).split(/\s+/).filter(Boolean);
        const normalizedRowValue = normalize(String(rowValue));
        return valueTerms.every((term) => normalizedRowValue.includes(term));
      });
    });
  }, [appliedFilters, columns, rows]);
  const sortedRows = useMemo(() => {
    if (!activeSortColumn) return [...filteredRows];
    return [...filteredRows].sort((left, right) => {
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
  }, [activeSortColumn, filteredRows, sort]);

  const clearFilters = () => {
    setAppliedFilters([]);
    setPagination({ rows, page: 0 });
  };

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
      <div className="min-w-0">
        {toolbar ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
            <p className="text-sm text-muted-foreground">
              {toolbarSummary ?? "Nenhum registro"}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {toolbar}
            </div>
          </div>
        ) : null}
        <p className="p-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      </div>
    );
  }

  const pageCount = Math.ceil(sortedRows.length / PAGE_SIZE);
  const hasActiveFilters = appliedFilters.length > 0;
  const filterControls = (
    <PortfolioTableFilterBuilder
      columns={filterColumns}
      activeFilters={appliedFilters}
      onApply={(filters) => {
        setAppliedFilters(filters);
        setPagination({ rows, page: 0 });
      }}
      onClear={clearFilters}
    />
  );

  if (sortedRows.length === 0 && hasActiveFilters) {
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          {filterControls}
          {toolbar ? (
            <div className="flex items-center gap-2">{toolbar}</div>
          ) : null}
        </div>
        <div className="space-y-2 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum resultado encontrado.
          </p>
        </div>
      </div>
    );
  }
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const firstRow = currentPage * PAGE_SIZE + 1;
  const lastRow = Math.min((currentPage + 1) * PAGE_SIZE, sortedRows.length);

  return (
    <div className="min-w-0">
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? `${sortedRows.length} de ${rows.length} ${rows.length === 1 ? "registro" : "registros"}`
              : (toolbarSummary ??
                `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`)}
          </p>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {filterControls}
            {toolbar}
          </div>
        </div>
      ) : null}
      {!toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? `${sortedRows.length} de ${rows.length} registros`
              : `${rows.length} registros`}
          </p>
          {filterControls}
        </div>
      ) : null}
      <Table className="min-w-262.5 table-fixed">
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow>
            {columns.map((column) => {
              const active = activeSortColumn?.id === column.id;
              const Icon = active
                ? sort.direction === "asc"
                  ? ArrowUp
                  : ArrowDown
                : ArrowUpDown;
              if (column.sortable === false) {
                return (
                  <TableHead
                    key={column.id}
                    className={cn(column.className, "px-3")}
                  >
                    <span
                      className={cn(
                        "block py-1 font-normal",
                        column.className?.includes("text-right") &&
                          "text-right",
                      )}
                    >
                      {column.label}
                    </span>
                  </TableHead>
                );
              }
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
                    onClick={() =>
                      setPagination({ rows, page: currentPage - 1 })
                    }
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
                    onClick={() =>
                      setPagination({ rows, page: currentPage + 1 })
                    }
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
    </div>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
