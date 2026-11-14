import { ArrowRight, ChevronDown, Shield, Upload } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  calculateEmergencyReserve,
  type EmergencyReserveCalculation,
} from "@/lib/emergency-reserve";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const months = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export function EmergencyReserveSummary({
  calculation,
  reserveObservation,
  onOpenReserve = () => {},
  onOpenImport,
  readOnly = false,
}: {
  calculation?: EmergencyReserveCalculation;
  reserveObservation?: {
    observedAmountCents: string;
    observedOn: string;
  } | null;
  onOpenReserve?: () => void;
  onOpenImport?: () => void;
  readOnly?: boolean;
}) {
  const canCalculateCoverage =
    calculation?.monthlyExpenses !== null &&
    calculation?.monthlyExpenses !== undefined &&
    calculation.coveredMonths !== null;
  const goalCalculation =
    calculation && reserveObservation
      ? {
          ...calculateEmergencyReserve({
            monthlyExpenses: calculation.monthlyExpenses,
            monthlyExpensesCents: calculation.monthlyExpensesCents,
            essentialMonthlyExpenses: calculation.essentialMonthlyExpenses,
            essentialExpenseSources: calculation.essentialExpenseSources,
            targetMonths: calculation.targetMonths,
            selectedValue:
              Number(BigInt(reserveObservation.observedAmountCents)) / 100,
            selectedValueCents: reserveObservation.observedAmountCents,
            selectedGroups: calculation.selectedGroups,
            unvaluedGroups: 0,
            referenceDate: reserveObservation.observedOn,
          }),
          missingSelectionCount: 0,
        }
      : calculation;
  const hasPersonalTarget =
    goalCalculation?.targetMonths !== null &&
    goalCalculation?.targetMonths !== undefined;
  const incomplete = Boolean(
    goalCalculation &&
    (goalCalculation.unvaluedGroups > 0 ||
      (goalCalculation.missingSelectionCount ?? 0) > 0),
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
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {onOpenImport && (
                <Button
                  type="button"
                  variant="link"
                  onClick={onOpenImport}
                  className="min-h-10 gap-2 p-0 text-sm font-medium text-primary"
                >
                  <Upload aria-hidden="true" className="size-4" />
                  Atualizar dados da B3
                </Button>
              )}
              <Button
                type="button"
                variant="link"
                onClick={onOpenReserve}
                className="min-h-10 gap-2 p-0 text-sm font-medium text-primary"
              >
                Ver reserva <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {(reserveObservation || calculation) && (
          <div className="mt-4 rounded-lg border bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {reserveObservation
                ? "Saldo atual da reserva"
                : "Posições vinculadas"}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {reserveObservation
                ? formatCurrencyCents(reserveObservation.observedAmountCents)
                : formatCurrency(calculation!.selectedValue)}
            </p>
            <p className="text-xs text-muted-foreground">
              {reserveObservation ? (
                <>
                  Informado em{" "}
                  {date.format(
                    new Date(`${reserveObservation.observedOn}T00:00:00Z`),
                  )}
                </>
              ) : calculation!.referenceDate ? (
                <>
                  B3 em{" "}
                  {date.format(
                    new Date(`${calculation!.referenceDate}T00:00:00Z`),
                  )}
                </>
              ) : null}
            </p>
          </div>
        )}

        {canCalculateCoverage ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-3">
              <div className="border-t py-3 sm:pl-4 lg:border-r lg:border-t-0 lg:px-5">
                <p className="text-xs text-muted-foreground">
                  Despesas mensais
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatCurrency(goalCalculation!.monthlyExpenses!)}
                </p>
              </div>
              <div className="border-t py-3 sm:pr-4 lg:border-r lg:border-t-0 lg:px-5">
                <p className="text-xs text-muted-foreground">
                  Sua meta pessoal
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {hasPersonalTarget
                    ? `${goalCalculation!.targetMonths} meses`
                    : "Sem meta pessoal configurada"}
                </p>
              </div>
              <div className="border-t py-3 sm:pl-4 lg:border-t-0 lg:pl-5">
                <p className="text-xs text-muted-foreground">
                  Cobertura em meses
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {incomplete ? "Estimativa parcial: " : ""}
                  {months.format(goalCalculation!.coveredMonths!)} meses de
                  despesas
                </p>
                <p className="text-xs text-muted-foreground">
                  {reserveObservation
                    ? "Calculada pelo saldo informado"
                    : "Calculada pelas posições vinculadas"}
                </p>
                {hasPersonalTarget &&
                  !incomplete &&
                  goalCalculation!.progressPercentage !== null && (
                    <div className="mt-2 space-y-1.5">
                      <Progress
                        aria-label="Cobertura em relação à sua meta pessoal"
                        value={Math.min(
                          100,
                          Math.round(goalCalculation!.progressPercentage!),
                        )}
                        className="h-2.5 bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        {Math.round(goalCalculation!.progressPercentage!)}% da
                        sua meta pessoal
                      </p>
                    </div>
                  )}
              </div>
            </div>
            {goalCalculation!.horizons?.some(
              (horizon) => horizon.targetValue !== null,
            ) && (
              <Collapsible className="border-t pt-3">
                <CollapsibleTrigger className="group flex min-h-10 w-fit cursor-pointer items-center gap-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Comparar metas de 3, 6, 9 e 12 meses
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-data-[state=open]:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <section
                    aria-label="Cenários de cobertura da reserva"
                    className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
                  >
                    {goalCalculation!.horizons!.map((horizon) => (
                      <div
                        key={horizon.months}
                        className="rounded-lg border bg-muted/20 p-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          {horizon.months} meses
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {horizon.targetValue === null
                            ? "Sem referência"
                            : formatCurrency(horizon.targetValue)}
                        </p>
                        {!incomplete && horizon.difference !== null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {horizon.difference > 0
                              ? `Faltam ${formatCurrency(horizon.difference)}`
                              : horizon.difference < 0
                                ? `${formatCurrency(Math.abs(horizon.difference))} acima`
                                : "Valor atingido"}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                </CollapsibleContent>
              </Collapsible>
            )}
            {hasPersonalTarget && incomplete ? (
              <p className="text-sm font-medium text-status-warning">
                A comparação com sua meta está incompleta porque há posições ou
                valores ausentes.
              </p>
            ) : hasPersonalTarget && goalCalculation!.difference !== null ? (
              <p
                className={
                  goalCalculation!.status === "below_target"
                    ? "text-sm font-medium text-status-warning"
                    : "text-sm text-muted-foreground"
                }
              >
                {goalCalculation!.status === "below_target"
                  ? `Faltam ${formatCurrency(goalCalculation!.difference!)} para a meta que você escolheu.`
                  : goalCalculation!.status === "above_target"
                    ? reserveObservation
                      ? `Sua meta está atingida. O saldo atual está ${formatCurrency(Math.abs(goalCalculation!.difference!))} acima dela.`
                      : `A cobertura está ${formatCurrency(Math.abs(goalCalculation!.difference!))} acima da meta que você escolheu.`
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
                {reserveObservation
                  ? "Cobertura = saldo total informado para a Reserva ÷ despesa mensal escolhida. Esse saldo acompanha a meta e não é somado novamente ao patrimônio da carteira."
                  : "Cobertura = valor das posições vinculadas à reserva ÷ despesa mensal escolhida. Sem saldo informado, esse valor também serve de referência da meta e compõe o patrimônio da carteira."}{" "}
                Sem uma meta salva, começamos por 6 meses; você pode alterar
                esse prazo na Reserva.
              </p>
              <p>
                Os cenários usam essa despesa mensal e não estimam aportes nem
                rendimentos futuros.
              </p>
              {calculation.essentialMonthlyExpenses !== null &&
                calculation.essentialMonthlyExpenses !== undefined && (
                  <p>
                    Referência das recorrências essenciais ativas: cerca de{" "}
                    {formatCurrency(calculation.essentialMonthlyExpenses)}/mês.
                    Você pode definir outra meta na Reserva.
                  </p>
                )}
              {calculation.essentialExpenseSources?.length ? (
                <ul className="list-inside list-disc space-y-1">
                  {calculation.essentialExpenseSources.map((source) => (
                    <li key={source.id}>
                      {source.description} ({source.frequency}):{" "}
                      {formatCurrency(source.amount)} · média de{" "}
                      {formatCurrency(source.monthlyEquivalent)}/mês
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                A cobertura não considera carência, prazo de resgate ou
                disponibilidade imediata dos ativos.
              </p>
              {goalCalculation?.referenceDate && !reserveObservation && (
                <p>
                  Data-base dos valores:{" "}
                  {date.format(
                    new Date(`${goalCalculation.referenceDate}T00:00:00Z`),
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
