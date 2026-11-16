"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decimalToCents } from "@/lib/portfolio-money";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import {
  formatAmountInput,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";
import {
  isFutureValuationDate,
  isValidValuationDate,
  todayInSaoPaulo,
} from "@/lib/valuation-date";

export type ObjectiveBalanceTrackingData = {
  observedAmountCents: string;
  observedOn: string;
} | null;

type Props = {
  objectiveId: string;
  objectiveName: string;
  isReserve?: boolean;
  tracking: ObjectiveBalanceTrackingData;
  saving: boolean;
  onSave: (input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
  }) => void;
};

function decimalFromCents(cents: string | undefined) {
  if (!cents) return "";
  const value = BigInt(cents);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

export function PortfolioObjectiveBalanceTracking({
  objectiveId,
  objectiveName,
  tracking,
  saving,
  onSave,
}: Props) {
  const isReserve = objectiveId === reserveObjectiveId;
  const editorKey = JSON.stringify([
    objectiveId,
    tracking?.observedAmountCents,
    tracking?.observedOn,
  ]);
  return (
    <BalanceTrackingEditor
      key={editorKey}
      objectiveId={objectiveId}
      objectiveName={objectiveName}
      isReserve={isReserve}
      tracking={tracking}
      saving={saving}
      onSave={onSave}
    />
  );
}

function BalanceTrackingEditor({
  objectiveId,
  objectiveName,
  isReserve = false,
  tracking,
  saving,
  onSave,
}: Props) {
  const [amount, setAmount] = useState(() =>
    formatAmountInput(decimalFromCents(tracking?.observedAmountCents)),
  );
  const [observedOn, setObservedOn] = useState(
    tracking?.observedOn ?? todayInSaoPaulo(),
  );
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const amountSelectionRef = useRef<CurrencyInputSelection | null>(null);

  useLayoutEffect(() => {
    const input = amountInputRef.current;
    const selection = amountSelectionRef.current;
    if (!input || !selection) return;
    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    amountSelectionRef.current = null;
  }, [amount]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = parseBrazilianAmount(amount);
    const canonicalAmount = Number.isFinite(parsedAmount)
      ? parsedAmount.toFixed(2)
      : "";
    const cents = decimalToCents(canonicalAmount);
    const nextAmountError =
      !Number.isFinite(parsedAmount) ||
      cents === null ||
      cents < 0n ||
      cents > 100_000_000_000_000n
        ? "Informe um valor entre R$ 0,00 e R$ 1 trilhão, com até duas casas decimais."
        : null;
    const nextDateError = !isValidValuationDate(observedOn)
      ? "Informe uma data-base válida."
      : isFutureValuationDate(observedOn)
        ? "A data-base não pode ser futura."
        : null;
    setAmountError(nextAmountError);
    setDateError(nextDateError);
    if (nextAmountError || nextDateError) return;
    onSave({
      objectiveId,
      amount: canonicalAmount,
      observedOn,
    });
  }

  return (
    <Card aria-labelledby="objective-balance-title">
      <CardHeader>
        <CardTitle id="objective-balance-title" className="text-base">
          {isReserve
            ? "Atualizar saldo da Reserva"
            : "Atualizar saldo do objetivo"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Informe o saldo que aparece no banco e a data. O objetivo acompanha
          esse valor; as posições da carteira continuam independentes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          noValidate
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(10rem,auto)] lg:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="objective-observed-amount">Saldo atual (R$)</Label>
            <Input
              id="objective-observed-amount"
              ref={amountInputRef}
              inputMode="numeric"
              autoComplete="off"
              placeholder="0,00"
              value={amount}
              onChange={(event) => {
                const inputValue = event.target.value;
                const nextAmount = formatAmountInput(inputValue);
                const start = event.target.selectionStart!;
                const end = event.target.selectionEnd!;
                amountSelectionRef.current = getCurrencyInputSelection(
                  inputValue,
                  nextAmount,
                  start,
                  end,
                  event.target.selectionDirection,
                );
                setAmount(nextAmount);
                setAmountError(null);
              }}
              aria-label={`Saldo observado de ${objectiveName}`}
              type="text"
              aria-invalid={Boolean(amountError)}
              aria-describedby={
                amountError ? "objective-amount-error" : undefined
              }
              required
            />
            {amountError && (
              <p
                id="objective-amount-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {amountError}
              </p>
            )}
          </div>
          <DatePickerField
            id="objective-observed-date"
            label="Data-base"
            value={observedOn}
            onChange={(value) => {
              setObservedOn(value);
              setDateError(null);
            }}
            required
            errorMessage={dateError}
          />
          <div className="sm:col-span-2 lg:col-span-1">
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar saldo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
