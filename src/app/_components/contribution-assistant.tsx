"use client";

import Link from "next/link";
import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowRight, ChevronDown, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { getApiMessage } from "@/lib/api-message";
import type { ContributionAllocationResult } from "@/lib/contribution-allocation";
import {
  formatAmountInput,
  getCurrencyInputSelection,
  parseBrazilianAmount,
  resolveCurrencyInputSelection,
  type CurrencyInputSelection,
} from "@/lib/currency-input";

const maximumContributionAmount = 1_000_000_000_000;

function isValidContributionAmount(value: number) {
  return (
    Number.isFinite(value) && value > 0 && value <= maximumContributionAmount
  );
}

export function ContributionAssistant() {
  const [amount, setAmount] = useState("");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<CurrencyInputSelection | null>(null);
  const [result, setResult] = useState<ContributionAllocationResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const parsedAmount = parseBrazilianAmount(amount);
  const canSubmit = isValidContributionAmount(parsedAmount);

  useLayoutEffect(() => {
    const input = amountInputRef.current;
    const selection = selectionRef.current;
    if (!input || !selection) return;

    const resolved = resolveCurrencyInputSelection(input.value, selection);
    input.setSelectionRange(resolved.start, resolved.end, resolved.direction);
    selectionRef.current = null;
  }, [amount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidContributionAmount(parsedAmount)) {
      setError("Informe um valor maior que zero, até R$ 1 trilhão.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio/contribution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contributionAmount: parsedAmount }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(
            body,
            "Não foi possível calcular o aporte. Tente novamente.",
          ),
        );
        setResult(null);
        return;
      }
      setResult(body as ContributionAllocationResult);
    } catch {
      toast.error("Não foi possível calcular o aporte. Tente novamente.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const allocations = result?.allocations ?? [];
  const reserveGapAfter =
    result?.reserveStatus !== "applied" ||
    result.reserveDifference === null ||
    result.reserveAmount === null
      ? null
      : Math.max(0, result.reserveDifference - result.reserveAmount);
  const totalClassGap = allocations.reduce(
    (total, allocation) => total + Math.max(0, allocation.targetGapValue),
    0,
  );
  const classGapAfterContribution = allocations.reduce(
    (total, allocation) =>
      total +
      Math.max(0, allocation.targetGapValue - allocation.contributionAmount),
    0,
  );
  const projectedPortfolioValue =
    result?.longTermPortfolioValue !== null &&
    result?.longTermPortfolioValue !== undefined &&
    result.remainingAmount !== null
      ? result.longTermPortfolioValue + result.remainingAmount
      : null;
  const visibleAllocations = allocations.filter(
    (allocation) =>
      allocation.currentValue > 0 ||
      allocation.targetGapValue > 0 ||
      allocation.targetPercentage > 0,
  );

  return (
    <section aria-labelledby="contribution-assistant-title">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle id="contribution-assistant-title" className="text-xl">
            Planejar aporte do mês
          </CardTitle>
          <CardDescription>
            Suas metas pessoais orientam esta simulação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="w-full space-y-2 sm:max-w-xs">
              <label
                htmlFor="contribution-amount"
                className="text-sm font-medium"
              >
                Valor disponível para este aporte
              </label>
              <Input
                id="contribution-amount"
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required
                value={amount}
                onChange={(event) => {
                  const value = event.target.value;
                  const nextAmount = formatAmountInput(value);
                  const start = event.target.selectionStart ?? value.length;
                  const end = event.target.selectionEnd ?? start;
                  selectionRef.current = getCurrencyInputSelection(
                    value,
                    nextAmount,
                    start,
                    end,
                    event.target.selectionDirection ?? "none",
                  );
                  setAmount(nextAmount);
                  setResult(null);
                  setError(null);
                }}
                placeholder="R$ 0,00"
              />
            </div>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? "Calculando..." : "Ver distribuição"}
            </Button>
          </form>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {result && (
            <div aria-live="polite" className="space-y-4 border-t pt-4">
              <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
                <AmountSummary
                  label="Aporte informado"
                  value={result.contributionAmount}
                />
                <ArrowRight
                  aria-hidden="true"
                  className="mx-auto size-4 rotate-90 text-muted-foreground md:rotate-0"
                />
                <AmountSummary
                  label="Para a reserva"
                  value={result.reserveAmount}
                  tone="reserve"
                  caption={
                    result.reserveStatus === "applied" && reserveGapAfter! > 0
                      ? `Ainda faltam ${formatCurrency(reserveGapAfter!)} da meta pessoal.`
                      : result.reserveStatus === "applied" ||
                          result.reserveStatus === "not_needed"
                        ? "Meta pessoal alcançada."
                        : result.reserveStatus === "not_configured"
                          ? "Sem meta pessoal definida."
                          : "Dados insuficientes."
                  }
                  fallback={
                    result.reserveStatus === "not_configured"
                      ? "Sem meta"
                      : "Indisponível"
                  }
                />
                <ArrowRight
                  aria-hidden="true"
                  className="mx-auto size-4 rotate-90 text-muted-foreground md:rotate-0"
                />
                <AmountSummary
                  label="Restante após reserva"
                  value={result.remainingAmount}
                  tone="remaining"
                />
              </div>

              {result.reserveStatus === "incomplete" && (
                <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  Revise os dados da reserva para calcular quanto separar antes
                  de distribuir o restante.
                </p>
              )}

              <div className="rounded-lg border p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Distribuição por classe</h3>
                    <p className="text-sm text-muted-foreground">
                      {result.strategySource === "user_defined"
                        ? "Metas definidas por você"
                        : "Estratégia calculada pelo InvestLab"}{" "}
                      · distribuição por classe
                    </p>
                    {result.longTermPortfolioValue !== null && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Carteira considerada na estratégia:{" "}
                        {formatCurrency(result.longTermPortfolioValue)}
                      </p>
                    )}
                  </div>
                </div>

                {result.status === "reserve_incomplete" ? (
                  <Limitation>
                    Revise a configuração e os valores selecionados para a
                    reserva antes de calcular o valor disponível para as
                    classes.
                  </Limitation>
                ) : result.status === "needs_targets" ? (
                  <Limitation>
                    Defina suas metas pessoais de alocação para comparar a
                    carteira e distribuir o aporte.
                  </Limitation>
                ) : result.status === "incomplete_data" ? (
                  <Limitation>
                    {result.unknownPositionCount} posição(ões) de longo prazo
                    estão sem valor ou classificação. Para evitar uma divisão
                    imprecisa, o InvestLab não distribuiu o aporte entre
                    classes.
                  </Limitation>
                ) : result.status === "no_positions" ? (
                  <Limitation>
                    Não há posições de longo prazo com valor conhecido para
                    calcular o desbalanceamento.
                  </Limitation>
                ) : (
                  <div className="space-y-3">
                    <div
                      className={`rounded-md p-3 text-sm ${classGapAfterContribution > 0 ? "bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" : "bg-muted/40"}`}
                    >
                      <p className="font-medium">
                        {totalClassGap === 0
                          ? `Nenhuma classe está abaixo da sua meta. ${formatCurrency(result.unallocatedAmount!)} fica sem classe direcionada.`
                          : classGapAfterContribution > 0
                            ? `A diferença após este aporte em relação às metas que você definiu seria de ${formatCurrency(classGapAfterContribution)}.`
                            : "Esta divisão cobre as metas das classes abaixo do alvo."}
                      </p>
                    </div>
                    <div
                      role="group"
                      aria-label="Legenda da comparação"
                      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full border-2 border-muted-foreground bg-card"
                        />
                        Hoje
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full bg-primary"
                        />
                        Após aporte
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="h-3 border-l-2 border-dashed border-foreground"
                        />
                        Meta
                      </span>
                    </div>
                    {visibleAllocations.map((allocation) => {
                      const projectedPercentage =
                        ((allocation.currentValue +
                          allocation.contributionAmount) /
                          projectedPortfolioValue!) *
                        100;
                      const isBelowTarget =
                        allocation.currentPercentage <
                        allocation.targetPercentage;
                      return (
                        <div
                          key={allocation.assetClass}
                          className="space-y-1.5 rounded-md border p-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                            <span className="font-medium">
                              {allocation.assetClass}
                            </span>
                            <Badge
                              variant="outline"
                              className={
                                isBelowTarget
                                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                                  : "border-muted bg-muted/40 text-muted-foreground"
                              }
                            >
                              {isBelowTarget
                                ? "Hoje abaixo da meta"
                                : "Hoje na meta ou acima"}
                            </Badge>
                            <span className="text-right">
                              <span className="block text-xs text-muted-foreground">
                                Aporte sugerido
                              </span>
                              <span className="block tabular-nums font-semibold">
                                {formatCurrency(allocation.contributionAmount)}
                              </span>
                            </span>
                          </div>
                          <div
                            role="img"
                            aria-label={`${allocation.assetClass}: hoje ${allocation.currentPercentage.toFixed(1)}%, após aporte ${projectedPercentage.toFixed(1)}%, meta ${allocation.targetPercentage.toFixed(1)}%.`}
                            className="space-y-1"
                          >
                            <div
                              className="relative mx-1 h-6"
                              aria-hidden="true"
                            >
                              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
                              <div
                                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/30"
                                style={{
                                  left: `${Math.min(allocation.currentPercentage, projectedPercentage)}%`,
                                  width: `${Math.abs(projectedPercentage - allocation.currentPercentage)}%`,
                                }}
                              />
                              <span
                                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted-foreground bg-card"
                                style={{
                                  left: `${Math.min(100, allocation.currentPercentage)}%`,
                                }}
                              />
                              <span
                                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
                                style={{
                                  left: `${Math.min(100, projectedPercentage)}%`,
                                }}
                              />
                              <span
                                className="absolute bottom-0 top-0 border-l-2 border-dashed border-foreground"
                                style={{
                                  left: `${Math.min(100, allocation.targetPercentage)}%`,
                                }}
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-1 text-xs">
                              <span className="tabular-nums">
                                Hoje {allocation.currentPercentage.toFixed(1)}%
                              </span>
                              <span className="text-center tabular-nums text-primary">
                                Após {projectedPercentage.toFixed(1)}%
                              </span>
                              <span className="text-right tabular-nums">
                                Meta {allocation.targetPercentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {totalClassGap > 0 &&
                      classGapAfterContribution === 0 &&
                      result.unallocatedAmount !== null &&
                      result.unallocatedAmount > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(result.unallocatedAmount)} ficam sem
                          classe direcionada.
                        </p>
                      )}
                  </div>
                )}
              </div>

              <Collapsible className="text-sm">
                <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-2 rounded-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Por quê e detalhes do cálculo
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-2 rounded-lg bg-muted/50 p-4 text-muted-foreground">
                  <p>
                    A alocação compara valores por classe com as metas completas
                    definidas por você. Posições selecionadas para a reserva são
                    excluídas do valor e do denominador de longo prazo.
                  </p>
                  {result.longTermPortfolioValue !== null && (
                    <p>
                      Base de longo prazo considerada:{" "}
                      {formatCurrency(result.longTermPortfolioValue)}.
                    </p>
                  )}
                  {allocations.map((allocation) => (
                    <p key={allocation.assetClass}>
                      {allocation.assetClass}:{" "}
                      {formatCurrency(allocation.currentValue)} atuais (
                      {allocation.currentPercentage.toFixed(1)}%) · meta{" "}
                      {allocation.targetPercentage.toFixed(1)}%
                      {allocation.targetGapValue > 0
                        ? ` · diferença estimada ${formatCurrency(allocation.targetGapValue)}`
                        : " · sem diferença positiva para aporte"}
                    </p>
                  ))}
                  <p>
                    A reserva é um destino separado da classe do ativo. O valor
                    destinado segue sua meta pessoal configurada; não é uma
                    recomendação universal. O cálculo usa valores conhecidos e
                    não escolhe instrumentos.
                  </p>
                  <p>
                    A seleção da reserva é a única separação de destino nesta
                    versão. Outros destinos pessoais ainda não são separados e
                    permanecem na carteira considerada.
                  </p>
                  <p>
                    As barras “Após” consideram a carteira de longo prazo mais
                    todo o restante do aporte. Valores sem classe direcionada
                    permanecem identificados à parte.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              {result.status === "needs_targets" && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/portfolio">
                    Revisar metas pessoais{" "}
                    <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AmountSummary({
  label,
  value,
  fallback = "Indisponível",
  caption,
  tone = "default",
}: {
  label: string;
  value: number | null;
  fallback?: string;
  caption?: string;
  tone?: "default" | "reserve" | "remaining";
}) {
  return (
    <div
      className={`rounded-lg p-3 ${tone === "reserve" ? "bg-amber-50 dark:bg-amber-950/30" : tone === "remaining" ? "bg-primary/10" : "bg-muted/40"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${tone === "reserve" && value !== null && value > 0 ? "text-amber-800 dark:text-amber-300" : tone === "reserve" && value === 0 ? "text-emerald-700 dark:text-emerald-300" : tone === "remaining" ? "text-primary" : ""}`}
      >
        {value === null ? fallback : formatCurrency(value)}
      </p>
      {caption && (
        <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}

function Limitation({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
