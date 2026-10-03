"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { PositionCombinationSuggestions } from "@/app/portfolio/_components/position-combination-suggestions";
import {
  formatCurrencyCents,
  portfolioMoneySourceLabels,
} from "@/lib/portfolio-money";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { formatCurrency } from "@/lib/utils";
import type { SuggestionCandidate } from "@/app/portfolio/_components/position-combination-suggestions";

type AssignmentTransfer = NonNullable<SuggestionCandidate["transfers"]>[number];
type TransferImpact = NonNullable<SuggestionCandidate["impacts"]>[number];

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export type ObjectivePosition = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  assetClass: string | null;
  geography?: string | null;
  positionCount: number;
  value: number | null;
  valueCents?: string | null;
  referenceDate?: string | null;
  unvaluedPositions: number;
  objectiveId: string | null;
  objectiveName: string | null;
  objectivePurpose?:
    "RESERVE" | "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
  canonicalValueSource?: string;
  estimationBaseDate?: string | null;
  estimatedThrough?: string | null;
  cdbEstimateComparisonApproximate?: boolean | null;
  cdbEstimateStatus?: "complete" | "provisional" | "unavailable" | null;
  cdbEstimateLimitation?: string | null;
};

type Props = {
  objectives: PortfolioObjective[];
  positions: ObjectivePosition[];
  preferredObjectiveId?: string;
  saving: boolean;
  onSave: (
    objectiveId: string,
    assetKeys: string[],
    transfers?: AssignmentTransfer[],
  ) => void;
};

export function PortfolioObjectiveAssignment({
  objectives,
  positions,
  preferredObjectiveId,
  saving,
  onSave,
}: Props) {
  const defaultObjectiveId =
    objectives.find(
      (objective) =>
        objective.id === preferredObjectiveId && objective.canEditAssignments,
    )?.id ??
    objectives.find((objective) => objective.canEditAssignments)?.id ??
    reserveObjectiveId;
  const [selectedObjectiveId, setSelectedObjectiveId] =
    useState(defaultObjectiveId);
  const [selectedAssetKeys, setSelectedAssetKeys] = useState<Set<string>>(
    new Set(
      objectives.find((objective) => objective.id === defaultObjectiveId)
        ?.assignedAssetKeys ?? [],
    ),
  );
  const [pendingTransfer, setPendingTransfer] = useState<{
    assetKeys: string[];
    transfers: AssignmentTransfer[];
    impacts: TransferImpact[];
  } | null>(null);
  const objective = useMemo(
    () => objectives.find((item) => item.id === selectedObjectiveId),
    [objectives, selectedObjectiveId],
  );

  function togglePosition(position: ObjectivePosition) {
    setSelectedAssetKeys((current) => {
      const next = new Set(current);
      if (next.has(position.assetKey)) next.delete(position.assetKey);
      else next.add(position.assetKey);
      return next;
    });
  }

  const positionGroups = [
    {
      title: "Já neste objetivo",
      positions: positions.filter(
        (position) => position.objectiveId === selectedObjectiveId,
      ),
    },
    {
      title: "Posições livres para associar",
      positions: positions.filter((position) => position.objectiveId === null),
    },
    {
      title: "Vinculadas a outro objetivo",
      positions: positions.filter(
        (position) =>
          position.objectiveId !== null &&
          position.objectiveId !== selectedObjectiveId,
      ),
    },
  ].filter((group) => group.positions.length > 0);

  if (!positions.length) {
    return (
      <section
        aria-labelledby="objective-positions-empty-title"
        className="space-y-3 rounded-lg border border-dashed p-5"
      >
        <div className="space-y-1">
          <h3
            id="objective-positions-empty-title"
            className="text-sm font-semibold"
          >
            Ainda não há posições para associar
          </h3>
          <p className="text-sm text-muted-foreground">
            Importe ou cadastre posições para acompanhar o patrimônio deste
            objetivo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/imports">Importar posições</Link>
        </Button>
      </section>
    );
  }

  if (!objective) {
    return (
      <section
        role="status"
        className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground"
      >
        Nenhum objetivo está disponível para associar posições.
      </section>
    );
  }

  return (
    <section aria-labelledby="objective-positions-title" className="space-y-3">
      <div className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="space-y-1">
          <h3
            id="objective-positions-title"
            className="text-base font-semibold"
          >
            Posições do objetivo
          </h3>
          <p className="text-sm text-muted-foreground">
            Cada posição pertence a um único objetivo. Escolha um destino e
            revise a seleção antes de salvar.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="objective-assignment-select">Objetivo</Label>
            <Select
              value={selectedObjectiveId}
              onValueChange={(objectiveId) => {
                setSelectedObjectiveId(objectiveId);
                setSelectedAssetKeys(
                  new Set(
                    objectives.find((item) => item.id === objectiveId)!
                      .assignedAssetKeys,
                  ),
                );
              }}
            >
              <SelectTrigger
                id="objective-assignment-select"
                aria-label="Objetivo para associar posições"
              >
                <SelectValue placeholder="Escolha um objetivo" />
              </SelectTrigger>
              <SelectContent>
                {objectives.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {objective && (
            <div className="flex items-end justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Total atual no objetivo
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {objective.currentValue === null
                    ? "Valor indisponível"
                    : formatCurrency(objective.currentValue)}
                </p>
              </div>
              <p className="shrink-0 pb-0.5 text-xs text-muted-foreground">
                {objective.assignedPositionCount} posições
              </p>
            </div>
          )}
        </div>
      </div>
      {objective?.id === reserveObjectiveId ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          A Reserva usa a seleção e as regras próprias existentes. Para alterar
          suas posições, use Configurar reserva.
        </p>
      ) : (
        <>
          {objective && (
            <PositionCombinationSuggestions
              endpoint="/api/portfolio/objectives/suggestions"
              title="Encontrar posições pelo valor"
              description="Pré-selecionar substitui a seleção atual nesta revisão; nada muda até Salvar posições. O filtro apenas limita a busca."
              amountLabel="Saldo atual do objetivo no banco"
              requestBody={{ objectiveId: objective.id }}
              targetObjectiveName={objective.name}
              holdings={positions
                .filter((position) => position.objectiveId === null)
                .map((position) => ({
                  assetKey: position.assetKey,
                  product: position.product,
                  institution: position.institution,
                  value: position.value,
                  valueCents: position.valueCents,
                  canonicalValueSource: position.canonicalValueSource,
                  estimationBaseDate: position.estimationBaseDate,
                  estimatedThrough: position.estimatedThrough,
                  cdbEstimateComparisonApproximate:
                    position.cdbEstimateComparisonApproximate,
                  referenceDate: position.referenceDate,
                  cdbEstimateStatus: position.cdbEstimateStatus,
                  cdbEstimateLimitation: position.cdbEstimateLimitation,
                }))}
              requestFilter={{
                label: "Filtrar por instrumento",
                key: "instrumentType",
                defaultValue: "ALL",
                options: [
                  { value: "ALL", label: "Todos os instrumentos" },
                  { value: "CDB", label: "Somente CDB identificado" },
                ],
              }}
              selectionActionLabel={(index) => "Pré-selecionar " + (index + 1)}
              applyButtonLabel="Pré-selecionar"
              onApply={(assetKeys, candidate) => {
                if (candidate?.transfers?.length) {
                  setPendingTransfer({
                    assetKeys,
                    transfers: candidate.transfers,
                    impacts: candidate.impacts ?? [],
                  });
                  return false;
                }
                setSelectedAssetKeys(new Set(assetKeys));
              }}
            />
          )}
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
            aria-live="polite"
          >
            <div>
              <p className="text-sm font-medium">
                Seleção para {objective.name}
              </p>
              <p className="text-xs text-muted-foreground">
                A pré-seleção não altera as atribuições existentes.
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {selectedAssetKeys.size} posições
            </p>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="group w-full justify-between"
              >
                Ver {positions.length} posições
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 transition-transform group-data-[state=open]:rotate-180"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="max-h-80 space-y-4 overflow-y-auto rounded-lg border p-3 sm:p-4">
                {positionGroups.map((group) => (
                  <section key={group.title} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h4>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {group.positions.map((position) => {
                        const assignedElsewhere =
                          position.objectiveId !== null &&
                          position.objectiveId !== selectedObjectiveId;
                        return (
                          <li key={position.assetKey}>
                            <label
                              className={
                                "flex h-full items-start gap-3 rounded-md border p-3 " +
                                (assignedElsewhere
                                  ? "cursor-not-allowed border-status-warning/20 bg-status-warning/5 opacity-70"
                                  : "cursor-pointer bg-card hover:border-primary/40 hover:bg-muted/30")
                              }
                            >
                              <Checkbox
                                checked={selectedAssetKeys.has(
                                  position.assetKey,
                                )}
                                disabled={assignedElsewhere || saving}
                                onCheckedChange={() => togglePosition(position)}
                                aria-label={
                                  "Associar " +
                                  position.product +
                                  " a " +
                                  objective.name
                                }
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                  {position.product}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {[
                                    position.assetCode,
                                    position.institution,
                                    position.assetClass,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Sem detalhes adicionais"}
                                </span>
                                <span className="block text-xs tabular-nums text-muted-foreground">
                                  {position.value === null
                                    ? "Valor indisponível"
                                    : formatCurrencyCents(
                                        position.valueCents ?? null,
                                      )}
                                  {position.positionCount > 1 &&
                                    " · " +
                                      position.positionCount +
                                      " posições agrupadas"}
                                  {position.unvaluedPositions > 0 &&
                                    " · " +
                                      position.unvaluedPositions +
                                      " sem valor"}
                                </span>
                                {position.canonicalValueSource && (
                                  <span className="block text-xs text-muted-foreground">
                                    Origem:{" "}
                                    {portfolioMoneySourceLabels[
                                      position.canonicalValueSource as keyof typeof portfolioMoneySourceLabels
                                    ] ?? position.canonicalValueSource}
                                  </span>
                                )}
                                {position.estimationBaseDate && (
                                  <span className="block text-xs text-muted-foreground">
                                    Data-base CURVA:{" "}
                                    {date.format(
                                      new Date(
                                        `${position.estimationBaseDate}T00:00:00Z`,
                                      ),
                                    )}
                                  </span>
                                )}
                                {position.estimatedThrough && (
                                  <span className="block text-xs text-muted-foreground">
                                    {position.cdbEstimateStatus ===
                                      "provisional" ||
                                    position.cdbEstimateComparisonApproximate
                                      ? "Estimativa aproximada até "
                                      : "Estimativa até "}
                                    {date.format(
                                      new Date(
                                        `${position.estimatedThrough}T00:00:00Z`,
                                      ),
                                    )}
                                  </span>
                                )}
                                {position.cdbEstimateLimitation && (
                                  <span className="block text-xs text-muted-foreground">
                                    {position.cdbEstimateLimitation}
                                  </span>
                                )}
                                {assignedElsewhere && (
                                  <span className="mt-1 inline-flex rounded-md border border-status-warning/30 bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning">
                                    Já vinculada a{" "}
                                    {position.objectiveName ?? "outro objetivo"}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() =>
                objective && onSave(objective.id, [...selectedAssetKeys])
              }
              disabled={saving || !objective}
            >
              {saving ? "Salvando…" : "Salvar posições"}
            </Button>
          </div>
        </>
      )}
      <AlertDialog
        open={pendingTransfer !== null}
        onOpenChange={() => setPendingTransfer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar transferência entre objetivos
            </AlertDialogTitle>
            <AlertDialogDescription>
              As posições listadas sairão dos objetivos atuais e passarão para{" "}
              {objective?.name} junto com a atualização das atribuições.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {pendingTransfer?.transfers.map((transfer) => (
              <div
                key={transfer.assetKey}
                className="space-y-3 rounded-lg border border-status-warning/30 bg-status-warning/5 p-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{transfer.product}</p>
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(transfer.value)}
                  </p>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
                  <div className="min-w-0 rounded-md border bg-background/70 p-2">
                    <span className="block text-muted-foreground">Sai de</span>
                    <span className="block truncate font-medium">
                      {transfer.fromObjectiveName}
                    </span>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <div className="min-w-0 rounded-md border bg-background/70 p-2">
                    <span className="block text-muted-foreground">
                      Entra em
                    </span>
                    <span className="block truncate font-medium">
                      {objective?.name}
                    </span>
                  </div>
                </div>
                <p className="sr-only">
                  De {transfer.fromObjectiveName} para {objective?.name}
                </p>
              </div>
            ))}
          </div>
          {pendingTransfer?.impacts.length ? (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="mb-2 font-medium">
                Saldo estimado após a transferência
              </p>
              <ul className="space-y-1">
                {pendingTransfer.impacts.map((impact) => (
                  <li key={impact.objectiveId}>
                    {impact.objectiveName}:{" "}
                    {impact.currentValue === null
                      ? "total indisponível"
                      : formatCurrency(impact.currentValue)}
                    {impact.targetAmount === null
                      ? ""
                      : ` de ${formatCurrency(impact.targetAmount)}`}
                    {impact.progressPercent === null
                      ? ""
                      : ` (${impact.progressPercent.toFixed(1)}%)`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !pendingTransfer}
              onClick={(event) => {
                event.preventDefault();
                onSave(
                  objective.id,
                  pendingTransfer!.assetKeys,
                  pendingTransfer!.transfers,
                );
                setPendingTransfer(null);
              }}
            >
              {saving ? "Transferindo…" : "Usar e transferir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
