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
  required?: boolean;
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

export function getTodayDateIso() {
  return toIsoDate(new Date());
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  required = false,
}: DatePickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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

  const handleInputChange = (nextValue: string) => {
    setInputValue(nextValue);
    setFormatError(false);
    const parsed = parseInputDate(nextValue);
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

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative w-full">
        <Input
          ref={inputRef}
          id={id}
          className="w-full pr-11"
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          onBlur={() => setFormatError(invalidInput)}
          placeholder="dd/mm/aaaa"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          aria-invalid={formatError && invalidInput}
          aria-describedby={
            formatError && invalidInput ? id + "-error" : undefined
          }
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
      {formatError && invalidInput && (
        <p id={id + "-error"} className="text-sm text-destructive" role="alert">
          {invalidDateMessage}
        </p>
      )}
    </div>
  );
}
