"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatAmountInput,
  getCurrencyInputSelection,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";
import { apiRequest } from "@/lib/api-client";
import { formatCurrencyCents } from "@/lib/portfolio-money";

type CapacityResult = {
  month: string;
  baselineIncomeCents: string | null;
  baselineExpenseCents: string | null;
  baseBalanceCents: string | null;
  incomeCents: string | null;
  expenseCents: string | null;
  simulatedBalanceCents: string | null;
  status: "positive" | "zero" | "negative" | "unavailable";
  completeness: "recorded_only" | "no_data";
  canSimulateStrategy: boolean;
};

type Props = { month: string };

const monthNow = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};

const formatInputCents = (value: string | null) =>
  value === null ? "" : formatAmountInput(value);

const parseMaskedCents = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return null;
  return digits.replace(/^0+(?=\d)/, "");
};

const exceedsMaximum = (value: string | null) =>
  value !== null && value.length > 14;

export function FinancialCapacitySimulator({ month }: Props) {
  const [open, setOpen] = useState(false);
  const [incomeCents, setIncomeCents] = useState<string | null>(null);
  const [expenseCents, setExpenseCents] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [simulation, setSimulation] = useState<CapacityResult | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const incomeInputRef = useRef<HTMLInputElement>(null);
  const expenseInputRef = useRef<HTMLInputElement>(null);
  const incomeSelectionRef = useRef<CurrencyInputSelection | null>(null);
  const expenseSelectionRef = useRef<CurrencyInputSelection | null>(null);
  const requestGenerationRef = useRef(0);
  const canSimulate = month >= monthNow();
  const currentSimulation = simulation?.month === month ? simulation : null;
  const incomeInvalid = exceedsMaximum(incomeCents);
  const expensesInvalid = exceedsMaximum(expenseCents);

  useLayoutEffect(() => {
    const fields = [
      [incomeInputRef.current, incomeSelectionRef],
      [expenseInputRef.current, expenseSelectionRef],
    ] as const;
    for (const [input, selectionRef] of fields) {
      const selection = selectionRef.current;
      if (!input || !selection) continue;
      const resolved = resolveCurrencyInputSelection(input.value, selection);
      input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
      selectionRef.current = null;
    }
  }, [incomeCents, expenseCents, selectionVersion]);

  async function loadBaseline() {
    const requestGeneration = ++requestGenerationRef.current;
    setBaselineLoading(true);
    try {
      const result = await apiRequest<CapacityResult>(
        "/api/finance-capacity",
        { method: "POST", body: JSON.stringify({ month }) },
        "Não foi possível carregar os valores do mês.",
      );
      if (requestGeneration !== requestGenerationRef.current) return;
      setIncomeCents(result.baselineIncomeCents);
      setExpenseCents(result.baselineExpenseCents);
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os valores do mês.",
      );
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setBaselineLoading(false);
      }
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      requestGenerationRef.current += 1;
      setBaselineLoading(false);
      setLoading(false);
      setSimulation(null);
      return;
    }
    if (canSimulate && !baselineLoading) {
      setSimulation(null);
      void loadBaseline();
    }
  }

  function handleAmountChange(
    value: string,
    selectionStart: number | null,
    selectionEnd: number | null,
    selectionDirection: "forward" | "backward" | "none" | null,
    selectionRef: { current: CurrencyInputSelection | null },
    setAmount: (amount: string | null) => void,
  ) {
    requestGenerationRef.current += 1;
    setLoading(false);
    const nextValue = formatAmountInput(value);
    const start = selectionStart ?? value.length;
    const end = selectionEnd ?? start;
    selectionRef.current = getCurrencyInputSelection(
      value,
      nextValue,
      start,
      end,
      selectionDirection,
    );
    setSelectionVersion((version) => version + 1);
    setAmount(parseMaskedCents(value));
    setSimulation(null);
  }

  async function simulate() {
    if (incomeCents === null || expenseCents === null) return;
    const requestGeneration = ++requestGenerationRef.current;
    setLoading(true);
    try {
      const result = await apiRequest<CapacityResult>(
        "/api/finance-capacity",
        {
          method: "POST",
          body: JSON.stringify({ month, incomeCents, expenseCents }),
        },
        "Não foi possível simular a capacidade mensal.",
      );
      if (requestGeneration !== requestGenerationRef.current) return;
      setSimulation(result);
    } catch (error) {
      if (requestGeneration !== requestGenerationRef.current) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível simular a capacidade mensal.",
      );
    } finally {
      if (requestGeneration === requestGenerationRef.current) {
        setLoading(false);
      }
    }
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <section className="rounded-xl border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-between rounded-xl px-4 py-3 text-left"
            aria-label="Simular mudança no mês"
          >
            <span className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-primary" />
              <span className="font-medium">Simular mudança no mês</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t px-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ajuste os totais para ver o saldo resultante. No mês atual, a base
              inclui valores previstos e lançamentos já realizados sem previsão;
              em meses futuros, usa os valores previstos cadastrados. A
              simulação não altera seus registros.
            </p>
            {!canSimulate ? (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Esta simulação está disponível apenas para o mês atual ou
                futuros. Os meses anteriores permanecem como histórico.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="capacity-month-income">Renda do mês</Label>
                    <Input
                      ref={incomeInputRef}
                      id="capacity-month-income"
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={formatInputCents(incomeCents)}
                      disabled={baselineLoading || loading}
                      aria-invalid={incomeInvalid}
                      aria-describedby={
                        incomeInvalid
                          ? "capacity-month-income-error"
                          : undefined
                      }
                      onChange={(event) => {
                        handleAmountChange(
                          event.target.value,
                          event.target.selectionStart,
                          event.target.selectionEnd,
                          event.target.selectionDirection,
                          incomeSelectionRef,
                          setIncomeCents,
                        );
                      }}
                    />
                    {incomeInvalid && (
                      <p
                        id="capacity-month-income-error"
                        role="alert"
                        className="text-sm text-status-danger"
                      >
                        Informe até R$ 999.999.999.999,99.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity-month-expenses">
                      Despesas do mês
                    </Label>
                    <Input
                      ref={expenseInputRef}
                      id="capacity-month-expenses"
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={formatInputCents(expenseCents)}
                      disabled={baselineLoading || loading}
                      aria-invalid={expensesInvalid}
                      aria-describedby={
                        expensesInvalid
                          ? "capacity-month-expenses-error"
                          : undefined
                      }
                      onChange={(event) => {
                        handleAmountChange(
                          event.target.value,
                          event.target.selectionStart,
                          event.target.selectionEnd,
                          event.target.selectionDirection,
                          expenseSelectionRef,
                          setExpenseCents,
                        );
                      }}
                    />
                    {expensesInvalid && (
                      <p
                        id="capacity-month-expenses-error"
                        role="alert"
                        className="text-sm text-status-danger"
                      >
                        Informe até R$ 999.999.999.999,99.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() => void simulate()}
                  disabled={
                    baselineLoading ||
                    loading ||
                    incomeInvalid ||
                    expensesInvalid ||
                    incomeCents === null ||
                    expenseCents === null
                  }
                >
                  {baselineLoading
                    ? "Carregando valores…"
                    : loading
                      ? "Calculando…"
                      : "Simular"}
                </Button>
                {currentSimulation && (
                  <div
                    className="space-y-2 rounded-lg border bg-muted/30 p-4"
                    aria-live="polite"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Saldo previsto antes da simulação
                        </p>
                        <p className="font-semibold tabular-nums">
                          {currentSimulation.baseBalanceCents === null
                            ? "Sem dados suficientes"
                            : formatCurrencyCents(
                                currentSimulation.baseBalanceCents,
                              )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Saldo com esses valores
                        </p>
                        <p
                          className={`font-semibold tabular-nums ${currentSimulation.status === "negative" ? "text-status-danger" : ""}`}
                        >
                          {currentSimulation.simulatedBalanceCents === null
                            ? "Não disponível"
                            : formatCurrencyCents(
                                currentSimulation.simulatedBalanceCents,
                              )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Base do cálculo
                        </p>
                        <p className="font-medium">
                          {currentSimulation.completeness === "no_data"
                            ? "Sem valores registrados"
                            : month === monthNow()
                              ? "Previsões + realizados sem previsão"
                              : "Somente valores previstos"}
                        </p>
                      </div>
                    </div>
                    {currentSimulation.status === "unavailable" && (
                      <p className="text-sm text-muted-foreground">
                        Informe renda e despesas para calcular o saldo. Valores
                        sem base conhecida não são presumidos como zero.
                      </p>
                    )}
                    {currentSimulation.status === "negative" && (
                      <p className="text-sm text-status-danger">
                        Nesse cenário, as despesas superam a renda informada.
                      </p>
                    )}
                    {currentSimulation.canSimulateStrategy &&
                      currentSimulation.simulatedBalanceCents && (
                        <Button asChild variant="link" className="h-auto p-0">
                          <Link
                            href={`/estrategia?aporteCents=${currentSimulation.simulatedBalanceCents}`}
                          >
                            Levar este valor para simular na Estratégia
                          </Link>
                        </Button>
                      )}
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
