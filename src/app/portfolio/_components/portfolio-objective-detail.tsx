"use client";

import { ArrowRight, Info, PiggyBank, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import type { PortfolioObjective } from "./portfolio-objective-card";
import {
  PortfolioObjectiveBalanceTracking,
  type ObjectiveBalanceTrackingData,
} from "./portfolio-objective-balance-tracking";

type Props = {
  objective: PortfolioObjective;
  onEdit: () => void;
  onManagePositions: () => void;
  onConfigureReserve: () => void;
  balanceSaving?: boolean;
  onSaveBalance?: (input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
    cdiPercentage: string | null;
  }) => void;
};

export function PortfolioObjectiveDetail({
  objective,
  onEdit,
  onManagePositions,
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
                    {isReserve ? "Reserva" : "Objetivo pessoal"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isReserve
                    ? "A reserva mantém a configuração e os critérios próprios atuais."
                    : "Valor calculado pelas posições inteiras vinculadas a este objetivo."}
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              {isReserve ? (
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  onClick={onConfigureReserve}
                >
                  Configurar reserva
                  <ArrowRight aria-hidden="true" className="ml-2 size-4" />
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    variant="outline"
                    onClick={onManagePositions}
                  >
                    Gerenciar posições
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    onClick={onEdit}
                  >
                    Editar objetivo
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Valor conhecido</p>
              <p className="text-xl font-semibold tabular-nums">
                {objective.currentValue === null
                  ? "Indisponível"
                  : formatCurrency(objective.currentValue)}
              </p>
              {objective.currentValue === null && objective.knownValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Subtotal conhecido: {formatCurrency(objective.knownValue)}
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
                  Acompanha o valor destinado, sem cálculo de progresso ou
                  falta.
                </p>
              )}
              {objective.remainingAmount !== null && (
                <p className="text-xs text-muted-foreground">
                  Falta {formatCurrency(objective.remainingAmount)}
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
                {Math.round(objective.progressPercent)}% da meta acompanhada
              </p>
            </div>
          )}
          {(objective.missingPositionCount > 0 ||
            objective.unvaluedPositionCount > 0) && (
            <p role="status" className="text-sm text-muted-foreground">
              {objective.missingPositionCount > 0 &&
                objective.missingPositionCount +
                  " vínculo(s) sem correspondência na carteira atual. "}
              {objective.unvaluedPositionCount > 0 &&
                objective.unvaluedPositionCount +
                  " posição(ões) sem valor conhecido. "}
              O progresso fica indisponível até os dados serem atualizados.
            </p>
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
    </div>
  );
}
