"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import { PortfolioObjectiveAssignment } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { ObjectivePosition } from "@/app/portfolio/_components/portfolio-objective-assignment";
import type { PortfolioObjective } from "@/app/portfolio/_components/portfolio-objective-card";
import { PortfolioObjectiveDetail } from "@/app/portfolio/_components/portfolio-objective-detail";
import { PortfolioObjectiveForm } from "@/app/portfolio/_components/portfolio-objective-form";
import { PortfolioObjectivesOverview } from "@/app/portfolio/_components/portfolio-objectives-overview";
import { EmergencyReserveEditor } from "@/app/portfolio/_components/emergency-reserve-editor";
import { PortfolioObjectiveOrganizer } from "@/app/portfolio/_components/portfolio-objective-organizer";
import { Button } from "@/components/ui/button";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import type { SuggestionCandidate } from "@/app/portfolio/_components/position-combination-suggestions";

type AssignmentTransfer = NonNullable<SuggestionCandidate["transfers"]>[number];

type ObjectivesData = {
  objectives: PortfolioObjective[];
  balanceReferences?: Array<{
    objectiveId: string;
    amountCents: string;
    observedDate: string;
  }>;
  destinationSummary: {
    categories: Array<{
      key:
        "reserve" | "personal" | "long_term" | "purpose_unknown" | "unassigned";
      value: number;
      valueCents: string;
      percentage: number;
    }>;
    knownTotal: number;
    knownTotalCents: string;
    missingPositionCount: number;
    unvaluedPositionCount: number;
  };
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
  | { kind: "organize" }
  | { kind: "reserve-settings" };

const loadErrorMessage = "Não foi possível carregar seus objetivos e posições.";

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
  const [deleteObjectiveId, setDeleteObjectiveId] = useState<string | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    let failureMessage = loadErrorMessage;
    try {
      const response = await fetch("/api/portfolio/objectives");
      const body: unknown = await response.json();
      if (!response.ok) {
        failureMessage = getApiMessage(body, loadErrorMessage);
        throw new Error("portfolio_objectives_load_failed");
      }
      setData(body as ObjectivesData);
      setError(null);
    } catch {
      setError(failureMessage);
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
    purpose: "PERSONAL_GOAL" | "LONG_TERM_INVESTMENT" | null;
    targetAmount: number | null;
    monthlyPlannedAmount: number | null;
  }) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/objectives", {
        method: editObjectiveId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          ...(editObjectiveId ? { objectiveId: editObjectiveId } : {}),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível salvar o objetivo."));
        return;
      }
      toast.success(
        getApiMessage(
          body,
          editObjectiveId ? "Objetivo atualizado." : "Objetivo criado.",
        ),
      );
      await loadData();
      const objectiveId =
        editObjectiveId ??
        (typeof body === "object" &&
        body !== null &&
        "id" in body &&
        typeof body.id === "string"
          ? body.id
          : "");
      if (objectiveId) {
        setView({ kind: "detail", objectiveId });
        navigateToObjective(objectiveId);
      }
    } catch {
      toast.error("Não foi possível salvar o objetivo.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignments(
    objectiveId: string,
    assetKeys: string[],
    transfers: AssignmentTransfer[] = [],
  ) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/objectives", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objectiveId, assetKeys, transfers }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível salvar as posições."),
        );
        return;
      }
      toast.success(
        transfers.length
          ? `${transfers.length} ${transfers.length === 1 ? "posição foi transferida" : "posições foram transferidas"} para ${data!.objectives.find((item) => item.id === objectiveId)!.name}.`
          : getApiMessage(body, "Posições vinculadas ao objetivo."),
      );
      await loadData();
      setView({ kind: "detail", objectiveId });
      navigateToObjective(objectiveId);
    } catch {
      toast.error("Não foi possível salvar as posições.");
    } finally {
      setSaving(false);
    }
  }

  async function saveObservedBalance(input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
    cdiPercentage: string | null;
  }) {
    setSaving(true);
    try {
      const response = await fetch("/api/portfolio/objectives/balance", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(getApiMessage(body, "Não foi possível salvar o saldo."));
        return;
      }
      toast.success(getApiMessage(body, "Saldo observado salvo."));
      await loadData();
    } catch {
      toast.error("Não foi possível salvar o saldo.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteObjective(objectiveId: string) {
    setSaving(true);
    try {
      const response = await fetch(
        "/api/portfolio/objectives?objectiveId=" +
          encodeURIComponent(objectiveId),
        { method: "DELETE" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        toast.error(
          getApiMessage(body, "Não foi possível excluir o objetivo."),
        );
        return;
      }
      toast.success(
        getApiMessage(
          body,
          "Objetivo excluído; as posições ficaram sem destino.",
        ),
      );
      setDeleteObjectiveId(null);
      setView({ kind: "overview" });
      navigateToObjective(null);
      await loadData();
    } catch {
      setDeleteObjectiveId(null);
      toast.error("Não foi possível excluir o objetivo.");
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
  }

  const subviewTitle =
    view.kind === "create"
      ? "Novo objetivo"
      : view.kind === "edit"
        ? "Editar objetivo"
        : view.kind === "assign"
          ? "Gerenciar posições"
          : view.kind === "organize"
            ? "Organizar objetivos"
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
              setView({ kind: "create" });
            }}
            onOrganize={() => setView({ kind: "organize" })}
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
              balanceSaving={saving}
              onSaveBalance={saveObservedBalance}
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
              onSave={saveAssignments}
            />
          )}
          {view.kind === "organize" && (
            <PortfolioObjectiveOrganizer
              objectives={data.objectives.map(({ id, name }) => ({ id, name }))}
              balanceReferences={data.balanceReferences}
              onCancel={returnFromSubview}
              onCompleted={() => {
                setView({ kind: "overview" });
                navigateToObjective(null);
              }}
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
