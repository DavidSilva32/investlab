"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  StrategyAllocationWorkspace,
  type StrategyClassValue,
} from "./strategy-allocation-workspace";
import type { StrategyAllocationPercentages } from "@/lib/strategy-allocation";

type StrategyData = {
  valuationDate: string;
  valuationDates: string[];
  longTermWealth: {
    knownValueCents: string;
    unvaluedPositionCount: number;
    positionCount: number;
    assignedPositionCount: number;
    unclassifiedKnownValueCents: string;
    unclassifiedPositionCount: number;
    classes: StrategyClassValue[];
  };
  destinationsNeedingPurposeConfirmation: number;
  savedAllocationPercentages: StrategyAllocationPercentages | null;
  allocationActive: boolean;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PersonalInvestmentStrategy() {
  const queryClient = useQueryClient();
  const { data, error, isPending, refetch } = useQuery({
    queryKey: queryKeys.portfolio.strategy(),
    queryFn: async () => {
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = apiRequest<StrategyData>(
          "/api/portfolio/strategy",
          { signal: controller.signal },
          "Não foi possível carregar sua estratégia.",
        );
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(
              new Error(
                "A carteira demorou mais que 30 segundos para responder. Tente carregar novamente.",
              ),
            );
          }, 30_000);
        });
        return await Promise.race([request, timeout]);
      } finally {
        clearTimeout(timeoutId);
      }
    },
  });

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Carregando as posições de Longo Prazo e os valores atuais…"
        className="w-full space-y-5"
      >
        <Card>
          <CardContent className="grid gap-5 pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
            <div className="flex items-center gap-4">
              <Skeleton className="hidden size-14 rounded-xl sm:block" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-10 w-64 max-w-full" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <div className="space-y-2 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-4 w-44 max-w-full" />
            </div>
            <Skeleton className="h-10 w-full sm:w-48" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-36 w-full sm:h-44 lg:h-48" />
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-28" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-2 pb-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Skeleton className="h-10 w-full sm:max-w-xs" />
              <Skeleton className="h-10 w-36" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível abrir a estratégia</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{error.message}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full space-y-5">
      {data.destinationsNeedingPurposeConfirmation > 0 && (
        <Alert>
          <AlertTitle>
            {data.destinationsNeedingPurposeConfirmation} destino(s) sem
            finalidade definida
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Eles permanecem fora da Estratégia até você classificar sua
              finalidade.
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/portfolio?panel=objectives">Revisar destinos</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {(data.valuationDates.length > 1 ||
        data.longTermWealth.unvaluedPositionCount > 0 ||
        data.longTermWealth.unclassifiedPositionCount > 0) && (
        <Alert>
          <AlertTitle>Cobertura dos valores</AlertTitle>
          <AlertDescription>
            {data.valuationDates.length > 1 &&
              `As posições têm datas efetivas diferentes: ${data.valuationDates.map(formatDate).join(", ")}. `}
            {data.longTermWealth.unvaluedPositionCount > 0 &&
              `${data.longTermWealth.unvaluedPositionCount} posição(ões) não têm valor conhecido. `}
            {BigInt(data.longTermWealth.unclassifiedKnownValueCents) > 0n
              ? `${formatCurrencyCents(data.longTermWealth.unclassifiedKnownValueCents)} em posições sem classe identificada não se enquadram nos quatro grupos mostrados.`
              : data.longTermWealth.unclassifiedPositionCount > 0
                ? `${data.longTermWealth.unclassifiedPositionCount} posição(ões) não têm classe identificada.`
                : null}
          </AlertDescription>
        </Alert>
      )}

      {data.longTermWealth.positionCount === 0 ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                Patrimônio de longo prazo
              </h2>
              <p className="mt-1 text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">
                {formatCurrencyCents(data.longTermWealth.knownValueCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Total investido em ativos de longo prazo ·{" "}
                {formatDate(data.valuationDate)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma posição está atribuída a um destino de longo prazo.
              <div className="mt-3">
                <Button asChild variant="outline" size="sm">
                  <Link href="/portfolio?panel=objectives">
                    Organizar destinos
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <StrategyAllocationWorkspace
          classes={data.longTermWealth.classes}
          knownValueCents={data.longTermWealth.knownValueCents}
          valuationDate={data.valuationDate}
          positionCount={data.longTermWealth.positionCount}
          unclassifiedKnownValueCents={
            data.longTermWealth.unclassifiedKnownValueCents
          }
          unvaluedPositionCount={data.longTermWealth.unvaluedPositionCount}
          savedAllocationPercentages={data.savedAllocationPercentages}
          allocationActive={data.allocationActive}
          onSaved={(allocationPercentages) =>
            queryClient.setQueryData<StrategyData>(
              queryKeys.portfolio.strategy(),
              { ...data, savedAllocationPercentages: allocationPercentages },
            )
          }
          onActivated={() =>
            queryClient.setQueryData<StrategyData>(
              queryKeys.portfolio.strategy(),
              {
                ...data,
                allocationActive: true,
              },
            )
          }
        />
      )}
      <p className="text-xs text-muted-foreground">
        A composição escolhida registra sua preferência. Ela não identifica
        recomendações nem altera metas, destinos, posições ou investimentos.
      </p>
    </div>
  );
}
