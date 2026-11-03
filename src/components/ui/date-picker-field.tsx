"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { format, isValid, parse, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DatePickerFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  required?: boolean;
  errorMessage?: string | null;
};

const isoDateFormat = "yyyy-MM-dd";
const inputDateFormat = "dd/MM/yyyy";

function parseInputDate(value: string) {
  const input = value.trim();
  const date = parse(input, inputDateFormat, new Date());
  return isValid(date) && format(date, inputDateFormat) === input
    ? date
    : undefined;
}

function parseIsoDate(value: string) {
  const date = parseISO(value);
  return isValid(date) && format(date, isoDateFormat) === value
    ? date
    : undefined;
}

function toIsoDate(date: Date) {
  return format(date, isoDateFormat);
}

function toInputDate(value: string) {
  const date = parseIsoDate(value);
  return date ? format(date, inputDateFormat) : "";
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4);
  return [day, month, year].filter(Boolean).join("/");
}

function getDateCaretPosition(value: string, digitsBefore: number) {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index]) && ++seen === digitsBefore) return index + 1;
  }
  return value.length;
}

export function getTodayDateIso() {
  return toIsoDate(new Date());
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  describedBy,
  required = false,
  errorMessage = null,
}: DatePickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretPosition = useRef<number | null>(null);
  const lastPropValue = useRef(value);
  const [inputValue, setInputValue] = useState(() => toInputDate(value));
  const [formatError, setFormatError] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const selectedDate = parseInputDate(inputValue);
  const [calendarMonth, setCalendarMonth] = useState(
    () => selectedDate ?? new Date(),
  );
  const invalidDateMessage = "Digite uma data válida no formato dd/mm/aaaa.";

  useEffect(() => {
    if (lastPropValue.current === value) return;
    lastPropValue.current = value;
    setInputValue(toInputDate(value));
    setFormatError(false);
  }, [value]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      inputValue.trim() && !selectedDate ? invalidDateMessage : "",
    );
  }, [inputValue, selectedDate, invalidDateMessage]);

  useEffect(() => {
    const position = pendingCaretPosition.current;
    if (position === null || !inputRef.current) return;
    const nextPosition = getDateCaretPosition(inputValue, position);
    inputRef.current.setSelectionRange(nextPosition, nextPosition);
    pendingCaretPosition.current = null;
  }, [inputValue]);

  const handleInputChange = (
    nextValue: string,
    selectionStart: number | null,
  ) => {
    const digitsBefore = (
      nextValue.slice(0, selectionStart ?? nextValue.length).match(/\d/g) ?? []
    ).length;
    const formattedValue = formatDateInput(nextValue);
    pendingCaretPosition.current = digitsBefore;
    setInputValue(formattedValue);
    setFormatError(false);
    const parsed = parseInputDate(formattedValue);
    const nextIsoValue = parsed ? toIsoDate(parsed) : "";
    if (parsed) setCalendarMonth(parsed);
    lastPropValue.current = nextIsoValue;
    onChange(nextIsoValue);
  };

  const handleSelect = (date: Date | undefined) => {
    const nextValue = date ? toIsoDate(date) : "";
    lastPropValue.current = nextValue;
    setInputValue(toInputDate(nextValue));
    if (date) setCalendarMonth(date);
    setFormatError(false);
    onChange(nextValue);
    setCalendarOpen(false);
  };

  const invalidInput = inputValue.trim() !== "" && !selectedDate;
  const displayedError =
    errorMessage || (formatError && invalidInput ? invalidDateMessage : null);
  const descriptionIds = [describedBy, displayedError ? id + "-error" : null]
    .filter((descriptionId): descriptionId is string => Boolean(descriptionId))
    .join(" ");

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative w-full">
        <Input
          ref={inputRef}
          id={id}
          className="w-full pr-11"
          value={inputValue}
          onChange={(event) =>
            handleInputChange(event.target.value, event.target.selectionStart)
          }
          onBlur={() => setFormatError(invalidInput)}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-invalid={Boolean(displayedError)}
          aria-describedby={descriptionIds || undefined}
        />
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
              aria-label={"Abrir calendário para " + label}
              aria-expanded={calendarOpen}
            >
              <CalendarDays aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={ptBR}
              selected={selectedDate}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              onSelect={handleSelect}
            />
          </PopoverContent>
        </Popover>
      </div>
      {displayedError && (
        <p id={id + "-error"} className="text-sm text-destructive" role="alert">
          {displayedError}
        </p>
      )}
    </div>
  );
}
