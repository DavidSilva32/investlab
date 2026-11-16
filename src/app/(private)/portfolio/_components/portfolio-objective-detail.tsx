"use client";

import { ArrowRight, ChevronDown, Info, PiggyBank, Target } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import type { PortfolioObjective } from "./portfolio-objective-card";
import {
  PortfolioObjectiveBalanceTracking,
  type ObjectiveBalanceTrackingData,
} from "./portfolio-objective-balance-tracking";

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

type Props = {
  objective: PortfolioObjective;
  onEdit: () => void;
  onConfigureReserve: () => void;
  balanceSaving?: boolean;
  onSaveBalance?: (input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
  }) => void;
};

export function PortfolioObjectiveDetail({
  objective,
  onEdit,
  onConfigureReserve,
  balanceSaving = false,
  onSaveBalance = () => {},
}: Props) {
  const isReserve =
    objective.kind === "RESERVE" || objective.id === reserveObjectiveId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {isReserve ? (
                  <PiggyBank aria-hidden="true" className="size-5" />
                ) : (
                  <Target aria-hidden="true" className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{objective.name}</CardTitle>
                  <Badge variant={isReserve ? "secondary" : "outline"}>
                    {isReserve
                      ? "Reserva"
                      : objective.purpose === "LONG_TERM_INVESTMENT"
                        ? "Investimento de longo prazo"
                        : objective.purpose === "PERSONAL_GOAL"
                          ? "Objetivo pessoal"
                          : "Classificação pendente"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isReserve
                    ? "Acompanhe o saldo total da Reserva informado no banco."
                    : objective.balanceTracking
                      ? "Acompanhe o saldo informado para este objetivo. Ele não altera os valores da carteira."
                      : "Informe o saldo atual para acompanhar o progresso deste objetivo."}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              {!isReserve && (
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  onClick={onEdit}
                >
                  Editar objetivo
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">
                {objective.balanceTracking
                  ? isReserve
                    ? "Saldo atual da Reserva"
                    : "Saldo informado"
                  : "Saldo informado"}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {objective.currentValue === null
                  ? "Saldo não informado"
                  : formatCurrency(objective.currentValue)}
              </p>
              {objective.balanceTracking && (
                <p className="text-xs text-muted-foreground">
                  Informado em{" "}
                  {formatDisplayDate(objective.balanceTracking.observedOn)}
                </p>
              )}
            </div>
            <div className="sm:border-l sm:pl-5">
              <p className="text-xs text-muted-foreground">
                {isReserve ? "Meta" : "Meta financeira"}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {objective.targetAmount === null
                  ? isReserve
                    ? "Não configurada"
                    : "Sem meta financeira"
                  : formatCurrency(objective.targetAmount)}
              </p>
              {!isReserve && objective.targetAmount === null && (
                <p className="text-xs text-muted-foreground">
                  Acompanha o saldo informado, sem cálculo de progresso ou meta.
                </p>
              )}
              {objective.remainingAmount !== null && (
                <p className="text-xs text-muted-foreground">
                  {objective.remainingAmount === 0
                    ? "Meta atingida"
                    : `Falta ${formatCurrency(objective.remainingAmount)}`}
                </p>
              )}
            </div>
          </div>
          {objective.progressPercent !== null && (
            <div className="space-y-1.5">
              <Progress
                value={objective.progressPercent}
                aria-label={
                  "Progresso de " +
                  objective.name +
                  ": " +
                  Math.round(objective.progressPercent) +
                  "%"
                }
              />
              <p className="text-xs text-muted-foreground">
                {Math.round(objective.progressPercent)}% da meta
              </p>
            </div>
          )}
          {objective.monthlyPlannedAmount !== null && (
            <p className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <Info
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              Aporte mensal planejado por você:{" "}
              {formatCurrency(objective.monthlyPlannedAmount)}. É uma intenção
              pessoal, não uma obrigação.
            </p>
          )}
        </CardContent>
      </Card>
      <PortfolioObjectiveBalanceTracking
        objectiveId={objective.id}
        objectiveName={objective.name}
        tracking={
          (objective.balanceTracking as ObjectiveBalanceTrackingData) ?? null
        }
        saving={balanceSaving}
        onSave={onSaveBalance}
      />
      {isReserve && (
        <Collapsible className="rounded-lg border px-3">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group h-11 w-full justify-between px-1 text-sm"
            >
              Opções avançadas
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-2 pb-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={onConfigureReserve}
            >
              Editar despesas e meta
            </Button>
          </CollapsibleContent>
        </Collapsible>
      )}
      {!isReserve && (
        <Button asChild variant="outline" className="w-full justify-between">
          <Link
            href={`/planejamento?objective=${encodeURIComponent(objective.id)}`}
          >
            <span>Planejar este objetivo</span>
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}
