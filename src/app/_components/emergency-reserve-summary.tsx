import Link from "next/link";
import { ArrowRight, ChevronDown, Shield } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const months = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function EmergencyReserveSummary({
  calculation,
}: {
  calculation?: EmergencyReserveCalculation;
}) {
  const canCalculateCoverage =
    calculation?.monthlyExpenses !== null &&
    calculation?.monthlyExpenses !== undefined &&
    calculation.coveredMonths !== null;
  const hasPersonalTarget =
    calculation?.targetMonths !== null &&
    calculation?.targetMonths !== undefined;
  const incomplete = Boolean(
    calculation &&
    (calculation.unvaluedGroups > 0 ||
      (calculation.missingSelectionCount ?? 0) > 0),
  );

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Shield aria-hidden="true" className="size-5" />
            </span>
            <h2 id="dashboard-reserve-title" className="text-xl font-semibold">
              Reserva de emergência
            </h2>
          </div>
          <Link
            href="/portfolio?panel=objectives&objective=reserve"
            className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver reserva <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {canCalculateCoverage ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border-t py-3 sm:pr-4 lg:border-r lg:border-t-0 lg:pr-5">
                <p className="text-xs text-muted-foreground">Valor conhecido</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(calculation.selectedValue)}
                </p>
              </div>
              <div className="border-t py-3 sm:pl-4 lg:border-r lg:border-t-0 lg:px-5">
                <p className="text-xs text-muted-foreground">
                  Despesas mensais
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(calculation.monthlyExpenses!)}
                </p>
              </div>
              <div className="border-t py-3 sm:pr-4 lg:border-r lg:border-t-0 lg:px-5">
                <p className="text-xs text-muted-foreground">
                  Sua meta pessoal
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {hasPersonalTarget
                    ? `${calculation.targetMonths} meses`
                    : "Sem meta pessoal configurada"}
                </p>
              </div>
              <div className="border-t py-3 sm:pl-4 lg:border-t-0 lg:pl-5">
                <p className="text-xs text-muted-foreground">
                  Cobertura em meses
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {incomplete ? "Estimativa parcial: " : ""}
                  {months.format(calculation.coveredMonths!)} meses de despesas
                </p>
                {hasPersonalTarget &&
                  !incomplete &&
                  calculation.progressPercentage !== null && (
                    <div className="mt-2 space-y-1.5">
                      <Progress
                        aria-label="Cobertura em relação à sua meta pessoal"
                        value={Math.min(
                          100,
                          Math.round(calculation.progressPercentage),
                        )}
                        className="h-2.5 bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        {Math.round(calculation.progressPercentage)}% da sua
                        meta pessoal
                      </p>
                    </div>
                  )}
              </div>
            </div>
            {hasPersonalTarget && incomplete ? (
              <p className="text-sm font-medium text-status-warning">
                A comparação com sua meta está incompleta porque há posições ou
                valores ausentes.
              </p>
            ) : hasPersonalTarget && calculation.difference !== null ? (
              <p
                className={
                  calculation.status === "below_target"
                    ? "text-sm font-medium text-status-warning"
                    : "text-sm text-muted-foreground"
                }
              >
                {calculation.status === "below_target"
                  ? `Faltam ${formatCurrency(calculation.difference)} para a meta que você escolheu.`
                  : calculation.status === "above_target"
                    ? `A cobertura está ${formatCurrency(Math.abs(calculation.difference))} acima da meta que você escolheu.`
                    : `Sua meta pessoal está atingida.`}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            {!calculation
              ? "Não foi possível carregar os dados da reserva. Tente novamente mais tarde."
              : calculation.monthlyExpenses === null
                ? "Informe suas despesas mensais para calcular quantos meses dos valores conhecidos da reserva elas cobrem."
                : "As despesas informadas precisam ser maiores que zero para calcular a cobertura."}
          </p>
        )}

        {calculation && (
          <Collapsible className="mt-4 border-t pt-3 text-sm text-muted-foreground">
            <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Origem, cálculo e limitações
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              <p>
                A cobertura divide o valor conhecido das posições que você
                selecionou como reserva pelas despesas mensais informadas. A
                meta em meses, quando aparece, é uma escolha sua e não uma
                recomendação do InvestLab.
              </p>
              <p>
                Este cálculo não verifica carência, resgate ou prazo para o
                dinheiro ficar disponível; ele não confirma liquidez efetiva.
              </p>
              {calculation.referenceDate && (
                <p>
                  Data-base dos valores:{" "}
                  {date.format(
                    new Date(`${calculation.referenceDate}T00:00:00Z`),
                  )}
                  .
                </p>
              )}
              {calculation.unvaluedGroups > 0 && (
                <p>
                  {calculation.unvaluedGroups} grupo(s) selecionado(s) contêm
                  posições sem valor; o total considera apenas valores
                  conhecidos.
                </p>
              )}
              {calculation.missingSelectionCount ? (
                <p>
                  {calculation.missingSelectionCount} seleção(ões) salva(s) não
                  correspondem a posições da carteira atual e não entram no
                  cálculo. Você pode revisar a seleção na carteira.
                </p>
              ) : null}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
