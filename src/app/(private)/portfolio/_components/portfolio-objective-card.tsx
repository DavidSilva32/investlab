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
import type { ObjectiveBalanceTrackingData } from "./portfolio-objective-balance-tracking";

export type PortfolioObjective = {
  id: string;
  kind: string;
  purpose?: "RESERVE" | "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
  name: string;
  targetAmount: number | null;
  monthlyPlannedAmount: number | null;
  currentValue: number | null;
  remainingAmount: number | null;
  progressPercent: number | null;
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
          <span className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
            <span className="row-span-2 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {isReserve ? (
                <PiggyBank aria-hidden="true" className="size-5" />
              ) : (
                <Target aria-hidden="true" className="size-5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block break-words font-semibold">
                {objective.name}
              </span>
              <Badge
                variant="outline"
                className={`${purposeClass} whitespace-normal text-left`}
              >
                {isReserve
                  ? "Reserva"
                  : objective.purpose === "LONG_TERM_INVESTMENT"
                    ? "Investimento de longo prazo"
                    : objective.purpose === "PERSONAL_GOAL"
                      ? "Objetivo pessoal"
                      : "Classificação pendente"}
              </Badge>
            </span>
            <span className="col-span-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-left">
              <span className="block font-semibold tabular-nums">
                {objective.balanceTracking ? (
                  <span className="mb-0.5 block text-xs font-normal text-muted-foreground">
                    {isReserve ? "Saldo atual da Reserva" : "Saldo informado"}
                  </span>
                ) : null}
                {objective.currentValue === null
                  ? "Saldo não informado"
                  : formatCurrency(objective.currentValue)}
                {objective.balanceTracking ? (
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Informado em{" "}
                    {formatDisplayDate(objective.balanceTracking.observedOn)}
                  </span>
                ) : null}
              </span>
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
                  {objective.remainingAmount === 0
                    ? "Meta atingida"
                    : `Falta ${formatCurrency(objective.remainingAmount as number)}`}
                </span>
              </span>
            </span>
          ) : objective.targetAmount !== null ? (
            <span className="block text-xs font-normal text-muted-foreground">
              Progresso indisponível com os dados atuais
            </span>
          ) : null}
          {objective.monthlyPlannedAmount !== null && (
            <span className="block text-xs font-normal text-muted-foreground">
              Planejado por você:{" "}
              {formatCurrency(objective.monthlyPlannedAmount)}
              /mês · intenção, não obrigação
            </span>
          )}
        </CardContent>
      </Button>
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
            description="O histórico de saldos deste objetivo será removido. As posições da carteira não serão alteradas."
            confirmLabel="Confirmar exclusão"
            loading={deleting}
            onConfirm={onDelete}
          />
        </div>
      )}
    </Card>
  );
}
