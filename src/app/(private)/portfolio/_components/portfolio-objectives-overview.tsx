"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PortfolioObjectiveCard,
  type PortfolioObjective,
} from "./portfolio-objective-card";

type Props = {
  data: { objectives: PortfolioObjective[] };
  deleting: boolean;
  deleteObjectiveId: string | null;
  onOpen: (objective: PortfolioObjective) => void;
  onEdit: (objective: PortfolioObjective) => void;
  onDeleteOpenChange: (objectiveId: string, open: boolean) => void;
  onDelete: (objectiveId: string) => void;
  onCreate: () => void;
};

export function PortfolioObjectivesOverview({
  data,
  deleting,
  deleteObjectiveId,
  onOpen,
  onEdit,
  onDeleteOpenChange,
  onDelete,
  onCreate,
}: Props) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Seus objetivos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Acompanhe o saldo informado em cada objetivo. A carteira B3 é
              calculada separadamente.
            </p>
          </div>
          <Button type="button" onClick={onCreate} className="w-full sm:w-auto">
            <Plus aria-hidden="true" className="size-4" />
            Novo objetivo
          </Button>
        </CardHeader>
        <CardContent>
          {data.objectives.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.objectives.map((objective) => (
                <PortfolioObjectiveCard
                  key={objective.id}
                  objective={objective}
                  deleteDialogOpen={deleteObjectiveId === objective.id}
                  deleting={deleting}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onDeleteOpenChange={(open) =>
                    onDeleteOpenChange(objective.id, open)
                  }
                  onDelete={() => onDelete(objective.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Ainda não há objetivos. Crie um para acompanhar um saldo e uma
                meta.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
