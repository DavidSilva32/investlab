import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { formatCurrency } from "@/lib/utils";

export function EmergencyReserveSummary({
  calculation,
}: {
  calculation?: EmergencyReserveCalculation;
}) {
  const configured =
    calculation &&
    calculation.monthlyExpenses !== null &&
    calculation.targetMonths !== null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Reserva de emergência</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Prazo e resgate não verificados.
            </p>
          </div>
          <Link
            href="/portfolio"
            className="text-sm font-medium text-primary hover:underline"
          >
            Configurar na carteira
          </Link>
        </div>

        {!configured ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Defina seu custo mensal, sua meta em meses e os ativos acompanhados.
          </p>
        ) : calculation.status === "expenses_required" ? (
          <p role="status" className="rounded-md border p-4 text-sm">
            Informe um custo mensal maior que zero para calcular os meses
            cobertos.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Valor selecionado"
              value={formatCurrency(calculation.selectedValue)}
            />
            <Metric
              label="Custo mensal definido"
              value={formatCurrency(calculation.monthlyExpenses!)}
            />
            <Metric
              label="Despesas cobertas"
              value={`${calculation.coveredMonths!.toFixed(1)} meses`}
            />
            <Metric
              label={`Meta pessoal · ${calculation.targetMonths} meses`}
              value={formatCurrency(calculation.targetValue!)}
            />
            <Metric
              label={
                calculation.status === "above_target"
                  ? "Acima da meta configurada"
                  : calculation.status === "on_target"
                    ? "Diferença para a meta"
                    : "Falta para a meta configurada"
              }
              value={formatCurrency(Math.abs(calculation.difference!))}
            />
            <div className="space-y-2 sm:col-span-2 xl:col-span-4">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Posição registrada</span>
                {calculation.referenceDate && (
                  <span className="shrink-0">
                    {new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "UTC",
                    }).format(
                      new Date(`${calculation.referenceDate}T00:00:00Z`),
                    )}
                  </span>
                )}
              </div>
              {calculation.progressPercentage !== null && (
                <progress
                  className="h-2 w-full accent-primary"
                  max={100}
                  value={calculation.progressPercentage}
                  aria-label="Progresso em relação à meta pessoal da reserva"
                />
              )}
              {calculation.unvaluedGroups > 0 && (
                <p className="text-xs text-muted-foreground">
                  {calculation.unvaluedGroups} grupo(s) selecionado(s) contém
                  posição(ões) sem valor informado; o total considera apenas
                  valores conhecidos.
                </p>
              )}
              {calculation.missingSelectionCount ? (
                <p role="status" className="text-xs text-muted-foreground">
                  {calculation.missingSelectionCount} seleção(ões) salva(s) não
                  corresponde(m) a grupo(s) da importação recente e não entra(m)
                  no cálculo. Revise a seleção na carteira.
                </p>
              ) : null}{" "}
              <details className="text-xs text-muted-foreground">
                <summary className="w-fit cursor-pointer underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Como é calculado
                </summary>
                <p className="mt-2 max-w-2xl">
                  Meses cobertos = valor selecionado ÷ custo mensal. A meta =
                  custo mensal × meses definidos por você; é uma referência
                  pessoal, não uma recomendação universal.
                </p>
              </details>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
