import { ArrowRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

export type DashboardObjective = {
  id: string;
  name: string;
  kind: string;
  currentValue: number | null;
  targetAmount: number | null;
  balanceTracking: {
    observedAmountCents: string;
    observedOn: string;
  } | null;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardDestinationsOverview({
  objectives,
  loading = false,
  unavailable = false,
  onRetry,
  onOpenObjectives,
  readOnly = false,
}: {
  objectives?: DashboardObjective[];
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  onOpenObjectives?: () => void;
  readOnly?: boolean;
}) {
  if (loading && !objectives)
    return (
      <Card aria-label="Carregando objetivos" aria-busy="true">
        <CardContent className="space-y-4 p-5" role="status">
          <span className="sr-only">Carregando objetivos</span>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  if (!objectives && !unavailable) return null;

  return (
    <Card className="h-full" aria-labelledby="dashboard-objectives-title">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="dashboard-objectives-title"
            className="flex items-center gap-2 text-lg font-semibold"
          >
            <Target aria-hidden="true" className="size-4 text-primary" />
            Objetivos
          </h2>
          {!readOnly && (
            <Button
              type="button"
              variant="link"
              onClick={onOpenObjectives}
              className="h-auto min-h-9 gap-1 px-0 text-sm font-medium"
            >
              Ver objetivos <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
        {unavailable ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2"
            role="status"
          >
            <span className="text-sm text-muted-foreground">
              Objetivos indisponíveis
            </span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : objectives!.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Nenhum objetivo cadastrado.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Saldos dos objetivos">
            {objectives!.map((objective) => {
              const value = objective.currentValue;
              const progress =
                value !== null && objective.targetAmount !== null
                  ? Math.min((value / objective.targetAmount) * 100, 100)
                  : null;
              return (
                <li key={objective.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium">
                      {objective.name}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums">
                      {value === null
                        ? "Saldo não informado"
                        : formatCurrency(value)}
                    </span>
                  </div>
                  {objective.balanceTracking && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Informado em{" "}
                      {dateFormatter.format(
                        new Date(
                          `${objective.balanceTracking.observedOn}T00:00:00Z`,
                        ),
                      )}
                    </p>
                  )}
                  {progress !== null && (
                    <div className="mt-2 space-y-1">
                      <Progress
                        value={progress}
                        aria-label={`Progresso de ${objective.name}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(objective.targetAmount!)} de meta ·{" "}
                        {Math.round(progress)}%
                      </p>
                    </div>
                  )}
                  {value === null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Informe o saldo do banco para acompanhar este objetivo.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Saldos informados para objetivos não são somados ao patrimônio da
          carteira.
        </p>
      </CardContent>
    </Card>
  );
}
