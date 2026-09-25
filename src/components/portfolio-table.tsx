"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
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

export function PortfolioTable<Row extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  initialSort,
}: PortfolioTableProps<Row>) {
  const [sort, setSort] = useState(initialSort);
  const sortedRows = useMemo(() => {
    const column = columns.find((item) => item.id === sort.id) ?? columns[0];
    return [...rows].sort((left, right) => {
      const leftValue = column.value(left);
      const rightValue = column.value(right);
      if (leftValue === rightValue) return 0;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const result =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : collator.compare(String(leftValue), String(rightValue));
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);

  const toggleSort = (id: string) => {
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
            const active = sort.id === column.id;
            const Icon = active
              ? sort.direction === "asc"
                ? ArrowUp
                : ArrowDown
              : ArrowUpDown;
            return (
              <TableHead
                key={column.id}
                className={cn(column.className, "px-3")}
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
        {sortedRows.map((row) => (
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
    </Table>
  );
}
