"use client";

import { Filter, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PortfolioTableFilterOption = {
  value: string;
  label: string;
};

export type PortfolioTableFilterColumn = {
  id: string;
  label: string;
  options?: PortfolioTableFilterOption[];
};

export type PortfolioTableFilter = {
  columnId: string;
  value: string;
};

type Props = {
  columns: PortfolioTableFilterColumn[];
  activeFilters: PortfolioTableFilter[];
  onApply: (filters: PortfolioTableFilter[]) => void;
  onClear: () => void;
};

const isValidFilterDraft = (filters: PortfolioTableFilter[]) =>
  filters.length > 0 &&
  filters.every(
    (filter) => filter.columnId !== "" && filter.value.trim() !== "",
  );

export function applyPortfolioTableFilterDraft(
  filters: PortfolioTableFilter[],
  onApply: (filters: PortfolioTableFilter[]) => void,
  onApplied: () => void,
) {
  if (!isValidFilterDraft(filters)) return false;
  onApply(filters);
  onApplied();
  return true;
}

export function appendAvailablePortfolioTableFilter(
  filters: PortfolioTableFilter[],
  columns: PortfolioTableFilterColumn[],
) {
  const selectedColumns = filters.map((filter) => filter.columnId);
  const nextColumn = columns.find(
    (column) => !selectedColumns.includes(column.id),
  );
  if (!nextColumn) return filters;
  return [...filters, { columnId: nextColumn.id, value: "" }];
}

export function PortfolioTableFilterBuilder({
  columns,
  activeFilters,
  onApply,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PortfolioTableFilter[]>([]);
  const id = useId();

  const closeAndDiscard = () => {
    setDraftFilters([]);
    setOpen(false);
  };

  const apply = () => {
    applyPortfolioTableFilterDraft(draftFilters, onApply, () => setOpen(false));
  };

  const canApply = isValidFilterDraft(draftFilters);
  const selectedColumns = draftFilters.map((filter) => filter.columnId);

  const updateFilter = (
    index: number,
    updates: Partial<PortfolioTableFilter>,
  ) => {
    setDraftFilters((current) =>
      current.map((filter, filterIndex) =>
        filterIndex === index
          ? {
              ...filter,
              ...updates,
              ...(updates.columnId && updates.columnId !== filter.columnId
                ? { value: "" }
                : {}),
            }
          : filter,
      ),
    );
  };

  const addFilter = () => {
    setDraftFilters((current) =>
      appendAvailablePortfolioTableFilter(current, columns),
    );
  };

  const activeDescriptions = activeFilters.map((filter) => {
    const column = columns.find((item) => item.id === filter.columnId);
    const valueLabel = column?.options?.find(
      (option) => option.value === filter.value,
    )?.label;
    return `${column?.label ?? filter.columnId}: ${valueLabel ?? filter.value}`;
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setDraftFilters(
              activeFilters.length > 0
                ? activeFilters.map((filter) => ({ ...filter }))
                : [{ columnId: columns[0]?.id ?? "", value: "" }],
            );
            setOpen(true);
          } else closeAndDiscard();
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Filter aria-hidden="true" className="mr-2 size-4" />
            Filtros
            {activeFilters.length > 0 && (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {activeFilters.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-labelledby={`${id}-title`}
          className="w-[min(24rem,calc(100vw-2rem))] space-y-4"
          onEscapeKeyDown={closeAndDiscard}
          onInteractOutside={(event) => {
            const target = event.target;
            if (
              target instanceof HTMLElement &&
              target.closest("[role='listbox']")
            ) {
              event.preventDefault();
              return;
            }
            closeAndDiscard();
          }}
        >
          <div className="space-y-1">
            <h3 id={`${id}-title`} className="text-sm font-semibold">
              Filtros da tabela
            </h3>
            <p className="text-xs text-muted-foreground">
              Combine critérios. Todos precisam corresponder. Em texto, todos os
              termos precisam aparecer na coluna.
            </p>
          </div>
          <div className="space-y-3">
            {draftFilters.map((filter, index) => {
              const column = columns.find(
                (item) => item.id === filter.columnId,
              );
              const columnId = `${id}-column-${index}`;
              const valueId = `${id}-value-${index}`;
              const availableColumns = columns.filter(
                (item) =>
                  item.id === filter.columnId ||
                  !selectedColumns.includes(item.id),
              );

              return (
                <div
                  key={`${id}-filter-${index}`}
                  className="space-y-2 rounded-md border p-3"
                >
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={columnId}>Coluna {index + 1}</Label>
                      <Select
                        value={filter.columnId}
                        onValueChange={(value) =>
                          updateFilter(index, { columnId: value })
                        }
                      >
                        <SelectTrigger
                          id={columnId}
                          aria-label={`Coluna ${index + 1}`}
                        >
                          <SelectValue placeholder="Selecione uma coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableColumns.map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {draftFilters.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover critério ${index + 1}`}
                        onClick={() =>
                          setDraftFilters((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <X aria-hidden="true" className="size-4" />
                      </Button>
                    )}
                  </div>
                  {column?.options ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={valueId}>Valor {index + 1}</Label>
                      <Select
                        value={filter.value}
                        onValueChange={(value) =>
                          updateFilter(index, { value })
                        }
                      >
                        <SelectTrigger
                          id={valueId}
                          aria-label={`Valor ${index + 1}`}
                        >
                          <SelectValue placeholder="Selecione um valor" />
                        </SelectTrigger>
                        <SelectContent>
                          {column.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor={valueId}>Valor {index + 1}</Label>
                      <Input
                        id={valueId}
                        aria-label={`Valor para ${column?.label ?? "coluna"}`}
                        placeholder="Digite o valor"
                        value={filter.value}
                        onChange={(event) =>
                          updateFilter(index, { value: event.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addFilter}
              disabled={draftFilters.length >= columns.length}
            >
              <Plus aria-hidden="true" className="mr-1.5 size-4" />
              Adicionar critério
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeAndDiscard}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={apply}
                disabled={!canApply}
              >
                Filtrar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {activeDescriptions.length > 0 && (
        <div
          role="group"
          className="flex min-w-0 flex-wrap items-center gap-1.5"
          aria-label="Filtros ativos"
        >
          {activeDescriptions.map((description, index) => (
            <Badge
              key={`${description}-${index}`}
              variant="secondary"
              className="max-w-full truncate"
            >
              {description}
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
