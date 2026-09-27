"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type MonthYearPickerProps = {
  id: string;
  value: string | null;
  disabled?: boolean;
  ariaDescribedBy?: string;
  onChange: (value: string | null) => void;
};

const months = [
  { value: "01", short: "Jan", full: "janeiro" },
  { value: "02", short: "Fev", full: "fevereiro" },
  { value: "03", short: "Mar", full: "março" },
  { value: "04", short: "Abr", full: "abril" },
  { value: "05", short: "Mai", full: "maio" },
  { value: "06", short: "Jun", full: "junho" },
  { value: "07", short: "Jul", full: "julho" },
  { value: "08", short: "Ago", full: "agosto" },
  { value: "09", short: "Set", full: "setembro" },
  { value: "10", short: "Out", full: "outubro" },
  { value: "11", short: "Nov", full: "novembro" },
  { value: "12", short: "Dez", full: "dezembro" },
];

function yearFrom(value: string | null) {
  return value ? Number(value.slice(0, 4)) : new Date().getFullYear();
}

function formatMonth(value: string) {
  const month = months[Number(value.slice(5, 7)) - 1]!;
  return month.full + " de " + value.slice(0, 4);
}

export function MonthYearPicker({
  id,
  value,
  disabled = false,
  ariaDescribedBy,
  onChange,
}: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const [yearView, setYearView] = useState(() => ({
    value,
    year: yearFrom(value),
  }));
  const displayYear =
    yearView.value === value ? yearView.year : yearFrom(value);
  const yearLabel = String(displayYear).padStart(4, "0");

  function selectMonth(month: string) {
    onChange(yearLabel + "-" + month);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          className="w-full justify-between font-normal"
        >
          <span className={value ? "capitalize" : "text-muted-foreground"}>
            {value ? formatMonth(value) : "Escolha mês e ano"}
          </span>
          <CalendarDays
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Ano anterior"
            disabled={disabled || displayYear === 0}
            onClick={() => setYearView({ value, year: displayYear - 1 })}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <h3 aria-live="polite" className="text-sm font-semibold tabular-nums">
            {yearLabel}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Próximo ano"
            disabled={disabled || displayYear === 9999}
            onClick={() => setYearView({ value, year: displayYear + 1 })}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div
          role="group"
          aria-label="Selecione o mês"
          className="grid grid-cols-3 gap-2"
        >
          {months.map((month) => {
            const selected = value === yearLabel + "-" + month.value;
            return (
              <Button
                key={month.value}
                type="button"
                variant={selected ? "default" : "outline"}
                size="sm"
                disabled={disabled}
                aria-label={`Selecionar ${month.full} de ${yearLabel}`}
                aria-pressed={selected}
                className="h-9"
                onClick={() => selectMonth(month.value)}
              >
                {month.short}
              </Button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!value || disabled}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            Limpar prazo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
