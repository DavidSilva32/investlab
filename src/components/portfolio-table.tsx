"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  sortable?: boolean;
  value: (row: Row) => string | number | null;
  searchValue?: (row: Row) => string | number | null;
  render: (row: Row) => ReactNode;
};

type Sort = { id: string; direction: "asc" | "desc" };

type PortfolioTableProps<Row extends { id: string }> = {
  columns: PortfolioTableColumn<Row>[];
  rows: Row[];
  emptyMessage: string;
  initialSort: Sort;
  toolbar?: ReactNode;
  toolbarSummary?: string;
  sourceFilter?: {
    value: (row: Row) => string | null | undefined;
    options: Array<{ value: string; label: string }>;
  };
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
  sourceFilter,
}: PortfolioTableProps<Row>) {
  const [sort, setSort] = useState(initialSort);
  const [pagination, setPagination] = useState({ rows, page: 0 });
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  if (pagination.rows !== rows) setPagination({ rows, page: 0 });
  const page = pagination.rows === rows ? pagination.page : 0;
  const activeSortColumn =
    columns.find((item) => item.id === sort.id) ?? columns[0];
  const filteredRows = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (source !== "all" && sourceFilter?.value(row) !== source) {
        return false;
      }
      if (terms.length === 0) return true;
      const searchableValues = columns
        .map((column) => (column.searchValue ?? column.value)(row))
        .filter((value) => value !== null)
        .map(String);
      if (sourceFilter) {
        searchableValues.push(sourceFilter.value(row) ?? "");
        searchableValues.push(
          sourceFilter.options.find(
            (option) => option.value === sourceFilter.value(row),
          )?.label ?? "",
        );
      }
      const searchableText = normalize(searchableValues.join(" "));
      return terms.every((term) => searchableText.includes(term));
    });
  }, [columns, rows, search, source, sourceFilter]);
  const sortedRows = useMemo(() => {
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

  const resetFilters = () => {
    setSearch("");
    setSource("all");
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
  const hasActiveFilters = Boolean(search.trim()) || source !== "all";
  const filterControls = (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      <div className="relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Pesquisar na tabela"
          placeholder="Pesquisar em todas as colunas"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPagination({ rows, page: 0 });
          }}
          className="pl-9"
        />
      </div>
      {sourceFilter ? (
        <Select
          value={source}
          onValueChange={(value) => {
            setSource(value);
            setPagination({ rows, page: 0 });
          }}
        >
          <SelectTrigger
            className="w-full sm:w-36"
            aria-label="Filtrar por origem"
          >
            <SelectValue placeholder="Todas as origens" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            {sourceFilter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {hasActiveFilters ? (
        <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
          Limpar filtros
        </Button>
      ) : null}
    </div>
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
              const active = activeSortColumn.id === column.id;
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
