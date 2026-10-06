import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

export type UnassignedPortfolioSummary =
  | {
      status: "loaded";
      knownValue: number;
      positionCount: number;
      unvaluedPositionCount: number;
    }
  | { status: "unavailable" };

export function DashboardUnassignedSummary({
  summary,
  onRetry,
}: {
  summary: UnassignedPortfolioSummary | null | undefined;
  onRetry?: () => void;
}) {
  if (!summary) return null;

  return (
    <section aria-labelledby="dashboard-unassigned-title">
      {summary.status === "loaded" ? (
        <Card>
          <CardContent className="flex h-full flex-col items-start gap-4 p-5 sm:p-6">
            <div className="min-w-0">
              <h2
                id="dashboard-unassigned-title"
                className="text-lg font-semibold"
              >
                Patrimônio conhecido sem destino
              </h2>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {formatCurrency(summary.knownValue)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {summary.positionCount} posições ainda não associadas a um
                objetivo
                {summary.unvaluedPositionCount > 0 &&
                  ` · ${summary.unvaluedPositionCount} sem valor atual`}
              </p>
            </div>
            <Link
              href="/portfolio?panel=objectives"
              className="mt-auto inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ver objetivos <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent
            className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
            role="status"
          >
            <div>
              <h2
                id="dashboard-unassigned-title"
                className="text-sm font-medium"
              >
                Patrimônio sem destino indisponível
              </h2>
              <p className="text-xs text-muted-foreground">
                Não foi possível carregar este resumo. Nenhum valor foi
                presumido.
              </p>
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              onClick={onRetry}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
