"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatCurrency } from "@/lib/utils";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type ObjectivePosition = {
  assetKey: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  assetClass: string | null;
  positionCount: number;
  value: number | null;
  unvaluedPositions: number;
  objectiveId: string | null;
  objectiveName: string | null;
};

type Props = {
  objectives: PortfolioObjective[];
  positions: ObjectivePosition[];
  preferredObjectiveId?: string;
  saving: boolean;
  onSave: (objectiveId: string, assetKeys: string[]) => void;
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
      <div className="space-y-1">
        <h3 id="objective-positions-title" className="text-sm font-semibold">
          Associar posições a um objetivo
        </h3>
        <p className="text-xs text-muted-foreground">
          A atribuição vale para a posição inteira. O valor acompanha as
          próximas atualizações da carteira.
        </p>
      </div>
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
        <SelectTrigger aria-label="Objetivo para associar posições">
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
              amountLabel="Valor desejado"
              holdings={positions
                .filter((position) => position.objectiveId === null)
                .map((position) => ({
                  assetKey: position.assetKey,
                  product: position.product,
                  institution: position.institution,
                  value: position.value,
                }))}
              requestFilter={{
                label: "Filtrar por instrumento",
                key: "instrumentType",
                defaultValue: "ALL",
                options: [
                  { value: "ALL", label: "Todos os instrumentos sem destino" },
                  { value: "CDB", label: "Somente CDB identificado" },
                ],
              }}
              selectionActionLabel={(index) => "Pré-selecionar " + (index + 1)}
              applyButtonLabel="Pré-selecionar"
              onApply={(assetKeys) => setSelectedAssetKeys(new Set(assetKeys))}
            />
          )}
          <p className="rounded-md bg-muted/40 p-3 text-sm" aria-live="polite">
            {selectedAssetKeys.size} posição(ões) selecionada(s) para{" "}
            {objective.name}.
          </p>
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
              <ul className="grid max-h-80 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                {positions.map((position) => {
                  const assignedElsewhere =
                    position.objectiveId !== null &&
                    position.objectiveId !== selectedObjectiveId;
                  return (
                    <li key={position.assetKey}>
                      <label
                        className={
                          "flex h-full items-start gap-3 rounded-md border p-3 " +
                          (assignedElsewhere
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-muted/40")
                        }
                      >
                        <Checkbox
                          checked={selectedAssetKeys.has(position.assetKey)}
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
                              : formatCurrency(position.value)}
                            {position.positionCount > 1 &&
                              " · " +
                                position.positionCount +
                                " posições agrupadas"}
                            {position.unvaluedPositions > 0 &&
                              " · " + position.unvaluedPositions + " sem valor"}
                          </span>
                          {assignedElsewhere && (
                            <span className="mt-1 block text-xs text-muted-foreground">
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
    </section>
  );
}
