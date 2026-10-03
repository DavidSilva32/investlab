"use client";

import { MoreHorizontal, PiggyBank, Target } from "lucide-react";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import type { ObjectiveBalanceTrackingData } from "./portfolio-objective-balance-tracking";

export type PortfolioObjective = {
  id: string;
  kind: string;
  purpose?: "RESERVE" | "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
  name: string;
  targetAmount: number | null;
  monthlyPlannedAmount: number | null;
  currentValue: number | null;
  knownValue: number;
  remainingAmount: number | null;
  progressPercent: number | null;
  assignedPositionCount: number;
  missingPositionCount: number;
  unvaluedPositionCount: number;
  assignedAssetKeys: string[];
  canEditAssignments: boolean;
  balanceTracking?: ObjectiveBalanceTrackingData;
};

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

type Props = {
  objective: PortfolioObjective;
  deleteDialogOpen: boolean;
  deleting: boolean;
  onOpen: (objective: PortfolioObjective) => void;
  onEdit: (objective: PortfolioObjective) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onDelete: () => void;
};

export function PortfolioObjectiveCard({
  objective,
  deleteDialogOpen,
  deleting,
  onOpen,
  onEdit,
  onDeleteOpenChange,
  onDelete,
}: Props) {
  const isReserve =
    objective.kind === "RESERVE" || objective.id === reserveObjectiveId;
  const progress = objective.progressPercent;
  const purpose = isReserve
    ? "reserve"
    : objective.purpose === "LONG_TERM_INVESTMENT"
      ? "long_term"
      : objective.purpose === "PERSONAL_GOAL"
        ? "personal"
        : "purpose_unknown";
  const purposeClass = {
    reserve:
      "border-destination-reserve/40 bg-destination-reserve/10 text-destination-reserve",
    personal:
      "border-destination-personal/40 bg-destination-personal/10 text-destination-personal",
    long_term:
      "border-destination-long-term/40 bg-destination-long-term/10 text-destination-long-term",
    purpose_unknown:
      "border-destination-purpose-unknown/40 bg-destination-purpose-unknown/10 text-destination-purpose-unknown",
  }[purpose];

  return (
    <Card className="relative shadow-none transition-colors hover:border-primary/40">
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-start whitespace-normal rounded-xl p-0 text-left hover:bg-transparent"
        aria-label={"Abrir objetivo " + objective.name}
        onClick={() => onOpen(objective)}
      >
        <CardContent className="w-full space-y-4 p-4 pr-14 sm:p-5 sm:pr-14">
          <span className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {isReserve ? (
                <PiggyBank aria-hidden="true" className="size-5" />
              ) : (
                <Target aria-hidden="true" className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {objective.name}
              </span>
              <Badge variant="outline" className={purposeClass}>
                {isReserve
                  ? "Reserva"
                  : objective.purpose === "LONG_TERM_INVESTMENT"
                    ? "Investimento de longo prazo"
                    : objective.purpose === "PERSONAL_GOAL"
                      ? "Objetivo pessoal"
                      : "Classificação pendente"}
              </Badge>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold tabular-nums">
                {objective.currentValue === null
                  ? "Indisponível"
                  : formatCurrency(objective.currentValue)}
              </span>
              {objective.currentValue === null && objective.knownValue > 0 && (
                <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                  Subtotal conhecido: {formatCurrency(objective.knownValue)}
                </span>
              )}
              <span className="block text-xs font-normal text-muted-foreground">
                {objective.targetAmount === null
                  ? isReserve
                    ? "meta não configurada"
                    : "destino sem meta financeira"
                  : `de ${formatCurrency(objective.targetAmount)}`}
              </span>
            </span>
          </span>
          {progress !== null ? (
            <span className="block space-y-1.5">
              <Progress
                value={progress}
                aria-label={
                  "Progresso de " +
                  objective.name +
                  ": " +
                  Math.round(progress) +
                  "%"
                }
              />
              <span className="flex justify-between text-xs font-normal text-muted-foreground">
                <span>{Math.round(progress)}% acompanhado</span>
                <span>
                  Falta {formatCurrency(objective.remainingAmount as number)}
                </span>
              </span>
            </span>
          ) : objective.targetAmount !== null ? (
            <span className="block text-xs font-normal text-muted-foreground">
              Progresso indisponível com os dados atuais
            </span>
          ) : null}
          {objective.balanceTracking && (
            <span className="grid gap-1 border-t pt-3 text-xs font-normal sm:grid-cols-2">
              <span className="text-muted-foreground">
                Saldo observado:{" "}
                {formatCurrencyCents(
                  objective.balanceTracking.observedAmountCents,
                )}
                <span className="block">
                  Em {formatDisplayDate(objective.balanceTracking.observedOn)}
                </span>
              </span>
              <span className="text-muted-foreground">
                {objective.balanceTracking.projection
                  ? `Projeção bruta: ${formatCurrencyCents(objective.balanceTracking.projection.projectedAmountCents)}`
                  : "Projeção indisponível"}
                <span className="block">
                  {objective.balanceTracking.projection
                    ? `Avaliada em ${formatDisplayDate(objective.balanceTracking.projection.projectedOn)}`
                    : "Acompanhamento separado da carteira"}
                </span>
              </span>
            </span>
          )}
          {(objective.missingPositionCount > 0 ||
            objective.unvaluedPositionCount > 0) && (
            <span className="block text-xs font-normal text-muted-foreground">
              {objective.missingPositionCount > 0 &&
                objective.missingPositionCount +
                  " vínculo(s) sem correspondência · "}
              {objective.unvaluedPositionCount > 0 &&
                objective.unvaluedPositionCount + " posição(ões) sem valor"}
            </span>
          )}
          {objective.monthlyPlannedAmount !== null && (
            <span className="block text-xs font-normal text-muted-foreground">
              Planejado por você:{" "}
              {formatCurrency(objective.monthlyPlannedAmount)}
              /mês · intenção, não obrigação
            </span>
          )}
        </CardContent>
      </Button>
      {!isReserve && !objective.purpose && (
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          Classifique este destino ao editar para decidir se entra na
          Estratégia.
        </p>
      )}
      {!isReserve && (
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={"Ações do objetivo " + objective.name}
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(objective)}>
                Editar objetivo
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteOpenChange(true)}
              >
                Excluir objetivo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmActionDialog
            hideTrigger
            open={deleteDialogOpen}
            onOpenChange={onDeleteOpenChange}
            title={"Excluir " + objective.name + "?"}
            description="As posições serão mantidas na carteira e ficarão sem destino."
            confirmLabel="Confirmar exclusão"
            loading={deleting}
            onConfirm={onDelete}
          />
        </div>
      )}
    </Card>
  );
}
