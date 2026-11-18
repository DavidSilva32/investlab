"use client";

import Link from "next/link";
import { useState } from "react";
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
import { apiRequest } from "@/lib/api-client";
import { formatCurrencyCents } from "@/lib/portfolio-money";

type Simulation = {
  month: string;
  baseBalanceCents: string | null;
  incomeReductionCents: string;
  expenseIncreaseCents: string;
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

const formatCents = (value: string) => formatCurrencyCents(value);

export function FinancialCapacitySimulator({ month }: Props) {
  const [open, setOpen] = useState(false);
  const [incomeReduction, setIncomeReduction] = useState("0.00");
  const [expenseIncrease, setExpenseIncrease] = useState("0.00");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);
  const canSimulate = month >= monthNow();
  const currentSimulation = simulation?.month === month ? simulation : null;

  async function simulate() {
    setLoading(true);
    try {
      const result = await apiRequest<Simulation>(
        "/api/finance-capacity",
        {
          method: "POST",
          body: JSON.stringify({ month, incomeReduction, expenseIncrease }),
        },
        "Não foi possível simular a capacidade mensal.",
      );
      setSimulation(result);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível simular a capacidade mensal.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
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
              Veja como uma renda menor ou uma despesa maior mudaria o saldo
              previsto. No mês atual, a base inclui valores previstos e
              lançamentos já realizados sem previsão; em meses futuros, usa os
              valores previstos cadastrados. A simulação não altera seus
              registros.
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
                    <Label htmlFor="capacity-income-reduction">
                      Redução de renda (R$)
                    </Label>
                    <Input
                      id="capacity-income-reduction"
                      type="number"
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      inputMode="decimal"
                      value={incomeReduction}
                      onChange={(event) => {
                        setIncomeReduction(event.target.value);
                        setSimulation(null);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="capacity-expense-increase">
                      Aumento de despesas (R$)
                    </Label>
                    <Input
                      id="capacity-expense-increase"
                      type="number"
                      min="0"
                      max="999999999999.99"
                      step="0.01"
                      inputMode="decimal"
                      value={expenseIncrease}
                      onChange={(event) => {
                        setExpenseIncrease(event.target.value);
                        setSimulation(null);
                      }}
                    />
                  </div>
                </div>
                <Button onClick={() => void simulate()} disabled={loading}>
                  {loading ? "Calculando…" : "Simular"}
                </Button>
                {currentSimulation && (
                  <div
                    className="space-y-2 rounded-lg border bg-muted/30 p-4"
                    aria-live="polite"
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Saldo previsto atual
                        </p>
                        <p className="font-semibold tabular-nums">
                          {currentSimulation.baseBalanceCents === null
                            ? "Sem dados suficientes"
                            : formatCents(currentSimulation.baseBalanceCents)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Saldo após a hipótese
                        </p>
                        <p
                          className={`font-semibold tabular-nums ${currentSimulation.status === "negative" ? "text-status-danger" : ""}`}
                        >
                          {currentSimulation.simulatedBalanceCents === null
                            ? "Não disponível"
                            : formatCents(
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
                            ? "Sem lançamentos no mês"
                            : month === monthNow()
                              ? "Previsões + realizados sem previsão"
                              : "Somente valores previstos"}
                        </p>
                      </div>
                    </div>
                    {currentSimulation.status === "unavailable" && (
                      <p className="text-sm text-muted-foreground">
                        Cadastre previsão de receita e despesa para estimar o
                        saldo. Dados ausentes não são tratados como zero.
                      </p>
                    )}
                    {currentSimulation.status === "negative" && (
                      <p className="text-sm text-status-danger">
                        Com essa hipótese, as despesas superariam as receitas
                        previstas cadastradas.
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
