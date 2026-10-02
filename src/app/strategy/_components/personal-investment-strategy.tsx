"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiMessage } from "@/lib/api-message";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import {
  StrategyAllocationWorkspace,
  type StrategyClassValue,
} from "./strategy-allocation-workspace";
import type { StrategyPercentages } from "./strategy-allocation-chart";

type StrategyData = {
  valuationDate: string;
  valuationDates: string[];
  longTermWealth: {
    knownValueCents: string;
    unvaluedPositionCount: number;
    positionCount: number;
    assignedPositionCount: number;
    unclassifiedKnownValueCents: string;
    classes: StrategyClassValue[];
  };
  destinationsNeedingPurposeConfirmation: number;
  savedAllocationPercentages: StrategyPercentages | null;
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PersonalInvestmentStrategy() {
  const [data, setData] = useState<StrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/portfolio/strategy");
        const body: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getApiMessage(body, "Não foi possível carregar sua estratégia."),
          );
        }
        if (active) setData(body as StrategyData);
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Não foi possível carregar sua estratégia.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (loading) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Lendo sua carteira…
      </div>
    );
  }
  if (!data || error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível abrir a estratégia</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              setError(null);
              setAttempt((current) => current + 1);
            }}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Patrimônio destinado ao longo prazo
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Posições vinculadas somente a destinos classificados como
              investimento de longo prazo.
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            Em {formatDate(data.valuationDate)}
          </span>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-3xl font-semibold tabular-nums">
            {formatCurrencyCents(data.longTermWealth.knownValueCents)}
          </p>
          <div className="text-right text-xs text-muted-foreground">
            <p>
              {data.longTermWealth.positionCount} posições ·{" "}
              {data.longTermWealth.assignedPositionCount} atribuídas a longo
              prazo
            </p>
            <p>
              Reserva, objetivos pessoais e posições sem destino ficam fora.
            </p>
          </div>
        </CardContent>
      </Card>

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
        BigInt(data.longTermWealth.unclassifiedKnownValueCents) > 0n) && (
        <Alert>
          <AlertTitle>Cobertura dos valores</AlertTitle>
          <AlertDescription>
            {data.valuationDates.length > 1 &&
              `As posições têm datas efetivas diferentes: ${data.valuationDates.map(formatDate).join(", ")}. `}
            {data.longTermWealth.unvaluedPositionCount > 0 &&
              `${data.longTermWealth.unvaluedPositionCount} posição(ões) não têm valor conhecido. `}
            {BigInt(data.longTermWealth.unclassifiedKnownValueCents) > 0n &&
              `${formatCurrencyCents(data.longTermWealth.unclassifiedKnownValueCents)} não se enquadram nos quatro grupos mostrados.`}
          </AlertDescription>
        </Alert>
      )}

      {data.longTermWealth.positionCount === 0 ? (
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
      ) : (
        <StrategyAllocationWorkspace
          classes={data.longTermWealth.classes}
          knownValueCents={data.longTermWealth.knownValueCents}
          unclassifiedKnownValueCents={
            data.longTermWealth.unclassifiedKnownValueCents
          }
          unvaluedPositionCount={data.longTermWealth.unvaluedPositionCount}
          savedAllocationPercentages={data.savedAllocationPercentages}
          onSaved={(allocationPercentages) =>
            setData({
              ...data,
              savedAllocationPercentages: allocationPercentages,
            })
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
