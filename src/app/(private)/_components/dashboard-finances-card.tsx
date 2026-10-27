"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminSupportView } from "@/components/app-shell";

type FinanceSummary = {
  summary: {
    expectedIncome: string | null;
    realizedIncome: string | null;
    expectedExpenses: string | null;
    realizedExpenses: string | null;
    recordedBalance: string | null;
    completeness: "recorded_only" | "no_data";
  };
};

function formatAmount(value: string | null) {
  return value === null ? "Sem registro" : formatCurrency(Number(value));
}

export function DashboardFinancesCard() {
  const supportView = useAdminSupportView();
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts();
  const month = `${dateParts.find((part) => part.type === "year")?.value}-${dateParts.find((part) => part.type === "month")?.value}`;
  const query = useQuery({
    queryKey: queryKeys.finances.overview(month),
    queryFn: () =>
      apiRequest<FinanceSummary>(
        `/api/finance-overview?month=${month}`,
        undefined,
        "Não foi possível carregar o resumo financeiro.",
      ),
  });
  const data = query.data;
  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Fluxo financeiro</h2>
            {data?.summary.completeness === "no_data" && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Comece por aqui
              </span>
            )}
          </div>
          {query.isPending ? (
            <p className="mt-1 text-sm text-muted-foreground" role="status">
              Carregando o resumo financeiro…
            </p>
          ) : query.isError ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span role="alert" className="text-destructive">
                {query.error instanceof Error
                  ? query.error.message
                  : "Não foi possível carregar o resumo financeiro."}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => void query.refetch()}
              >
                <RefreshCw aria-hidden="true" className="mr-1 size-3.5" />
                Tentar novamente
              </Button>
            </div>
          ) : data?.summary.completeness === "no_data" ? null : (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1 text-status-success">
                <ArrowUp aria-hidden="true" className="size-3.5" />
                Entradas{" "}
                <strong>
                  {formatAmount(data?.summary.realizedIncome ?? null)}
                </strong>
              </span>
              <span className="inline-flex items-center gap-1 text-status-danger">
                <ArrowDown aria-hidden="true" className="size-3.5" />
                Saídas{" "}
                <strong>
                  {formatAmount(data?.summary.realizedExpenses ?? null)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Saldo registrado{" "}
                <strong
                  className={
                    Number(data?.summary.recordedBalance) < 0
                      ? "text-status-danger"
                      : "text-foreground"
                  }
                >
                  {formatAmount(data?.summary.recordedBalance ?? null)}
                </strong>
              </span>
            </div>
          )}
          {supportView === true && (
            <p className="mt-2 text-xs text-muted-foreground">
              Visualização de suporte: somente leitura.
            </p>
          )}
        </div>
        <Button asChild variant="outline" className="min-h-10 shrink-0">
          <Link href="/financas">
            Abrir Finanças
            <ArrowRight aria-hidden="true" className="ml-2 size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
