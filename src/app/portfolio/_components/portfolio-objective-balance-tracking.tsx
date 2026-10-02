"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import { decimalToCents } from "@/lib/portfolio-money";
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
  cdiPercentage: string | null;
  projection: {
    projectedAmountCents: string;
    projectedOn: string;
    estimatedThrough: string;
    cdiPercentage: string;
    status: "projected" | "provisional";
  } | null;
  projectionUnavailableReason?:
    "missing_conditions" | "no_eligible_days" | "rates_unavailable" | null;
} | null;

type Props = {
  objectiveId: string;
  objectiveName: string;
  tracking: ObjectiveBalanceTrackingData;
  saving: boolean;
  onSave: (input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
    cdiPercentage: string | null;
  }) => void;
};

function decimalFromCents(cents: string | undefined) {
  if (!cents) return "";
  const value = BigInt(cents);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function PortfolioObjectiveBalanceTracking({
  objectiveId,
  objectiveName,
  tracking,
  saving,
  onSave,
}: Props) {
  const editorKey = JSON.stringify([
    objectiveId,
    tracking?.observedAmountCents,
    tracking?.observedOn,
    tracking?.cdiPercentage,
  ]);
  return (
    <BalanceTrackingEditor
      key={editorKey}
      objectiveId={objectiveId}
      objectiveName={objectiveName}
      tracking={tracking}
      saving={saving}
      onSave={onSave}
    />
  );
}

function BalanceTrackingEditor({
  objectiveId,
  objectiveName,
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
  const [cdiPercentage, setCdiPercentage] = useState(
    tracking?.cdiPercentage ?? "",
  );
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [cdiError, setCdiError] = useState<string | null>(null);
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
    const parsedCdi = Number(cdiPercentage);
    const nextCdiError =
      cdiPercentage.trim() &&
      (!/^\d+(?:\.\d+)?$/.test(cdiPercentage) ||
        !Number.isFinite(parsedCdi) ||
        parsedCdi <= 0 ||
        parsedCdi > 1000)
        ? "Informe um percentual maior que 0 e até 1.000% do CDI."
        : null;
    setAmountError(nextAmountError);
    setDateError(nextDateError);
    setCdiError(nextCdiError);
    if (nextAmountError || nextDateError || nextCdiError) return;
    onSave({
      objectiveId,
      amount: canonicalAmount,
      observedOn,
      cdiPercentage: cdiPercentage.trim() ? cdiPercentage.trim() : null,
    });
  }

  return (
    <Card aria-labelledby="objective-balance-title">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="objective-balance-title" className="text-base">
            Saldo observado no banco
          </CardTitle>
          <Badge variant="outline">Acompanhamento separado</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Informe o saldo total do objetivo. Ele não é somado à carteira.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {tracking && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Saldo observado</p>
              <p className="font-semibold tabular-nums">
                {formatCurrencyCents(tracking.observedAmountCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                Em {formatDisplayDate(tracking.observedOn)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Projeção bruta antes de impostos
              </p>
              {tracking.projection ? (
                <>
                  <p className="font-semibold tabular-nums">
                    {formatCurrencyCents(
                      tracking.projection.projectedAmountCents,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avaliada em{" "}
                    {formatDisplayDate(tracking.projection.projectedOn)}; CDI
                    até{" "}
                    {formatDisplayDate(tracking.projection.estimatedThrough)}
                    {tracking.projection.status === "provisional"
                      ? " · usa a última taxa oficial conhecida nas lacunas"
                      : " · taxas oficiais"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {tracking.projectionUnavailableReason ===
                    "missing_conditions" || tracking.cdiPercentage === null
                    ? "Sem condições suficientes para projetar; o saldo observado permanece como referência."
                    : tracking.projectionUnavailableReason ===
                        "no_eligible_days"
                      ? "Ainda não há dias úteis elegíveis para projetar. O saldo observado permanece como referência."
                      : "Não foi possível obter taxas CDI oficiais suficientes para projetar. O saldo observado permanece como referência."}
                </p>
              )}
            </div>
          </div>
        )}
        {tracking?.projection && (
          <p className="text-xs text-muted-foreground">
            A projeção não inclui impostos, aportes ou resgates que não foram
            informados.
          </p>
        )}
        <form
          noValidate
          onSubmit={submit}
          className="grid gap-3 sm:grid-cols-2"
        >
          <div className="space-y-1.5">
            <Label htmlFor="objective-observed-amount">Saldo total (R$)</Label>
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="objective-cdi-percentage">
              Rendimento contratado (% do CDI, opcional)
            </Label>
            <Input
              id="objective-cdi-percentage"
              inputMode="decimal"
              placeholder="Ex.: 100"
              value={cdiPercentage}
              onChange={(event) => {
                setCdiPercentage(event.target.value.replace(",", "."));
                setCdiError(null);
              }}
              type="text"
              pattern="\d+(?:\.\d+)?"
              aria-invalid={Boolean(cdiError)}
              aria-describedby={cdiError ? "objective-cdi-error" : undefined}
            />
            {cdiError && (
              <p
                id="objective-cdi-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {cdiError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Use apenas se o saldo renderiza a esse percentual. Sem essa
              condição, o sistema mantém somente o valor observado. Use até
              1.000% do CDI.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar saldo observado"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
