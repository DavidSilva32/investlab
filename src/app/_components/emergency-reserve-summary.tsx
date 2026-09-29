import Link from "next/link";
import { ChevronDown, Shield } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

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
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-foreground">
              <Shield aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Como está sua reserva?
              </p>
              <h2
                id="dashboard-reserve-title"
                className="text-xl font-semibold"
              >
                {canCalculateCoverage
                  ? `${incomplete ? "Estimativa parcial: " : ""}${calculation.coveredMonths!.toFixed(1)} meses de despesas`
                  : "Cobertura ainda não calculada"}
              </h2>
            </div>
          </div>
          <Link
            href="/portfolio"
            className="text-sm font-medium text-primary hover:underline"
          >
            Ver reserva
          </Link>
        </div>

        {canCalculateCoverage ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {formatCurrency(calculation.selectedValue)} conhecidos ÷{" "}
                {formatCurrency(calculation.monthlyExpenses!)} de despesas
                mensais
              </p>
              {hasPersonalTarget ? (
                <p className="text-sm font-medium">
                  Sua meta: {calculation.targetMonths} meses
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem meta pessoal configurada
                </p>
              )}
            </div>
            {hasPersonalTarget &&
              !incomplete &&
              calculation.progressPercentage !== null && (
                <div
                  role="progressbar"
                  aria-label="Cobertura em relação à sua meta pessoal"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(calculation.progressPercentage)}
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${calculation.progressPercentage}%` }}
                  />
                </div>
              )}
            {hasPersonalTarget && incomplete ? (
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                A comparação com sua meta está incompleta porque há posições ou
                valores ausentes.
              </p>
            ) : hasPersonalTarget && calculation.difference !== null ? (
              <p
                className={
                  calculation.status === "below_target"
                    ? "text-sm font-medium text-amber-800 dark:text-amber-300"
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
