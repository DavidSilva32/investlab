"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PortfolioObjectiveAssignment } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { PortfolioObjectiveDetail } from "@/app/portfolio/_components/portfolio-objective-detail";
import { PortfolioObjectiveForm } from "@/app/portfolio/_components/portfolio-objective-form";
import { PortfolioObjectivesOverview } from "@/app/portfolio/_components/portfolio-objectives-overview";
import { EmergencyReserveEditor } from "@/app/portfolio/_components/emergency-reserve-editor";
import { Button } from "@/components/ui/button";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

type ObjectivesData = {
  objectives: PortfolioObjective[];
  positions: ObjectivePosition[];
  unassignedKnownValue: number;
  unassignedPositionCount: number;
  unassignedUnvaluedPositionCount: number;
};

type View =
  | { kind: "overview" }
  | { kind: "detail"; objectiveId: string }
  | { kind: "create" }
  | { kind: "edit"; objectiveId: string; returnTo: "overview" | "detail" }
  | { kind: "assign"; objectiveId: string }
  | { kind: "reserve-settings" };

export function PortfolioObjectives({
  navigation = { open: true, objectiveId: null, screen: null },
  onNavigationChange = () => {},
}: {
  navigation?: {
    open: boolean;
    objectiveId: string | null;
    screen: string | null;
  };
  onNavigationChange?: (
    objectiveId: string | null,
    screen?: string | null,
  ) => void;
} = {}) {
  const [data, setData] = useState<ObjectivesData | null>(null);
  const [view, setView] = useState<View>(() =>
    getViewFromNavigation(navigation),
  );
  const navigationKey = JSON.stringify([
    navigation.open,
    navigation.objectiveId,
    navigation.screen,
  ]);
  const [appliedNavigationKey, setAppliedNavigationKey] =
    useState(navigationKey);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteObjectiveId, setDeleteObjectiveId] = useState<string | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/portfolio/objectives");
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setData(body as ObjectivesData);
      setError(null);
    } catch {
      setError("Não foi possível carregar seus objetivos e posições.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    window.addEventListener("portfolio:updated", loadData);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("portfolio:updated", loadData);
    };
  }, [loadData]);

  if (navigationKey !== appliedNavigationKey) {
    setAppliedNavigationKey(navigationKey);
    setView(getViewFromNavigation(navigation));
  }

  function navigateToObjective(objectiveId: string | null, screen?: string) {
    onNavigationChange(
      objectiveId === reserveObjectiveId ? "reserve" : objectiveId,
      screen ?? null,
    );
  }

  const editObjectiveId = view.kind === "edit" ? view.objectiveId : null;
  const activeObjectiveId =
    view.kind === "detail" || view.kind === "edit" || view.kind === "assign"
      ? view.objectiveId
      : view.kind === "reserve-settings"
        ? reserveObjectiveId
        : null;
  const activeObjective =
    data?.objectives.find((item) => item.id === activeObjectiveId) ?? null;

  async function saveObjective(values: {
    name: string;
    targetAmount: number | null;
    monthlyPlannedAmount: number | null;
  }) {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/portfolio/objectives", {
        method: editObjectiveId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(editObjectiveId ? { objectiveId: editObjectiveId } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      toast.success(
        editObjectiveId ? "Objetivo atualizado." : "Objetivo criado.",
      );
      await loadData();
      setView({ kind: "detail", objectiveId: editObjectiveId ?? body.id });
      navigateToObjective(editObjectiveId ?? body.id);
    } catch (saveError) {
      throw saveError instanceof Error
        ? saveError
        : new Error("Não foi possível salvar o objetivo.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignments(objectiveId: string, assetKeys: string[]) {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch("/api/portfolio/objectives", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectiveId, assetKeys }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      toast.success("Posições vinculadas ao objetivo.");
      await loadData();
      setView({ kind: "detail", objectiveId });
      navigateToObjective(objectiveId);
    } catch (saveError) {
      setFormError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar as posições.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteObjective(objectiveId: string) {
    setSaving(true);
    setFormError(null);
    try {
      const response = await fetch(
        "/api/portfolio/objectives?objectiveId=" +
          encodeURIComponent(objectiveId),
        { method: "DELETE" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      toast.success("Objetivo excluído; as posições ficaram sem destino.");
      setDeleteObjectiveId(null);
      setView({ kind: "overview" });
      navigateToObjective(null);
      await loadData();
    } catch (deleteError) {
      setDeleteObjectiveId(null);
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : "Não foi possível excluir o objetivo.",
      );
    } finally {
      setSaving(false);
    }
  }

  function returnFromSubview() {
    if (view.kind === "detail") {
      setView({ kind: "overview" });
      navigateToObjective(null);
    } else if (view.kind === "edit") {
      const nextView =
        view.returnTo === "detail"
          ? { kind: "detail" as const, objectiveId: view.objectiveId }
          : { kind: "overview" as const };
      setView(nextView);
      navigateToObjective(
        nextView.kind === "detail" ? nextView.objectiveId : null,
      );
    } else if (view.kind === "assign") {
      setView({ kind: "detail", objectiveId: view.objectiveId });
      navigateToObjective(view.objectiveId);
    } else if (view.kind === "reserve-settings") {
      setView({ kind: "detail", objectiveId: reserveObjectiveId });
      navigateToObjective(reserveObjectiveId);
    } else {
      setView({ kind: "overview" });
    }
    setFormError(null);
  }

  const subviewTitle =
    view.kind === "create"
      ? "Novo objetivo"
      : view.kind === "edit"
        ? "Editar objetivo"
        : view.kind === "assign"
          ? "Gerenciar posições"
          : view.kind === "reserve-settings"
            ? "Configurar reserva"
            : (activeObjective?.name ?? "Objetivo");

  return (
    <div className="space-y-5" data-testid="portfolio-objectives">
      {loading && !data && (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando objetivos e posições…
        </p>
      )}
      {error && !data && (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadData()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {data && view.kind === "overview" && (
        <>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <PortfolioObjectivesOverview
            data={data}
            deleting={saving}
            deleteObjectiveId={deleteObjectiveId}
            onOpen={(objective) => {
              setView({ kind: "detail", objectiveId: objective.id });
              navigateToObjective(objective.id);
            }}
            onEdit={(objective) =>
              setView({
                kind: "edit",
                objectiveId: objective.id,
                returnTo: "overview",
              })
            }
            onDeleteOpenChange={(objectiveId, open) =>
              setDeleteObjectiveId(open ? objectiveId : null)
            }
            onDelete={(objectiveId) => void deleteObjective(objectiveId)}
            onCreate={() => {
              setFormError(null);
              setView({ kind: "create" });
            }}
          />
        </>
      )}
      {data && view.kind !== "overview" && (
        <section
          aria-labelledby="objective-subview-title"
          className="space-y-4"
        >
          <div className="flex items-center gap-3 border-b pb-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={returnFromSubview}
              aria-label="Voltar"
            >
              <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
              Voltar
            </Button>
            <h2
              id="objective-subview-title"
              className="text-base font-semibold"
            >
              {subviewTitle}
            </h2>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          {view.kind === "detail" && activeObjective && (
            <PortfolioObjectiveDetail
              objective={activeObjective}
              onEdit={() =>
                setView({
                  kind: "edit",
                  objectiveId: activeObjective.id,
                  returnTo: "detail",
                })
              }
              onManagePositions={() =>
                setView({ kind: "assign", objectiveId: activeObjective.id })
              }
              onConfigureReserve={() => {
                setView({ kind: "reserve-settings" });
                navigateToObjective(reserveObjectiveId, "reserve-settings");
              }}
            />
          )}
          {view.kind === "detail" && !activeObjective && (
            <p role="status" className="text-sm text-muted-foreground">
              Este objetivo não está mais disponível.
            </p>
          )}
          {(view.kind === "create" || view.kind === "edit") && (
            <PortfolioObjectiveForm
              key={editObjectiveId ?? "new-objective"}
              hideTitle
              objective={
                view.kind === "edit"
                  ? data.objectives.find((item) => item.id === view.objectiveId)
                  : undefined
              }
              saving={saving}
              onSave={saveObjective}
              onCancel={returnFromSubview}
            />
          )}
          {view.kind === "assign" && activeObjective && (
            <PortfolioObjectiveAssignment
              key={
                activeObjective.id +
                ":" +
                activeObjective.assignedAssetKeys.join(",")
              }
              objectives={data.objectives}
              positions={data.positions}
              preferredObjectiveId={activeObjective.id}
              saving={saving}
              error={formError}
              onSave={saveAssignments}
            />
          )}
          {view.kind === "reserve-settings" && <EmergencyReserveEditor />}
        </section>
      )}
    </div>
  );
}

function getViewFromNavigation(navigation: {
  open: boolean;
  objectiveId: string | null;
  screen: string | null;
}): View {
  if (!navigation.open) return { kind: "overview" };
  if (navigation.screen === "reserve-settings") {
    return { kind: "reserve-settings" };
  }
  if (navigation.objectiveId) {
    return {
      kind: "detail",
      objectiveId:
        navigation.objectiveId === "reserve"
          ? reserveObjectiveId
          : navigation.objectiveId,
    };
  }
  return { kind: "overview" };
}
