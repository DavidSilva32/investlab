"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getApiMessage } from "@/lib/api-message";
import type { PortfolioObjective } from "@/app/(private)/portfolio/_components/portfolio-objective-card";
import { PortfolioObjectiveDetail } from "@/app/(private)/portfolio/_components/portfolio-objective-detail";
import { PortfolioObjectiveForm } from "@/app/(private)/portfolio/_components/portfolio-objective-form";
import { PortfolioObjectivesOverview } from "@/app/(private)/portfolio/_components/portfolio-objectives-overview";
import { EmergencyReserveEditor } from "@/app/(private)/portfolio/_components/emergency-reserve-editor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";
import { apiRequest } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
type ObjectivesData = { objectives: PortfolioObjective[] };

type View =
  | { kind: "overview" }
  | { kind: "detail"; objectiveId: string }
  | { kind: "create" }
  | { kind: "edit"; objectiveId: string; returnTo: "overview" | "detail" }
  | { kind: "reserve-settings" };

const loadErrorMessage = "Não foi possível carregar seus objetivos.";

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
  const objectivesQuery = useQuery({
    queryKey: queryKeys.portfolio.objectives(),
    queryFn: () =>
      apiRequest<ObjectivesData>(
        "/api/portfolio/objectives",
        undefined,
        loadErrorMessage,
      ),
  });
  const data = objectivesQuery.data ?? null;
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
  const loading = objectivesQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [deleteObjectiveId, setDeleteObjectiveId] = useState<string | null>(
    null,
  );

  const loadData = async () => {
    await objectivesQuery.refetch();
  };

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
    view.kind === "detail" || view.kind === "edit"
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

  async function saveObservedBalance(input: {
    objectiveId: string;
    amount: string;
    observedOn: string;
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
      toast.success(getApiMessage(body, "Saldo atualizado."));
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
      toast.success(getApiMessage(body, "Objetivo excluído."));
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
        : view.kind === "reserve-settings"
          ? "Editar reserva"
          : (activeObjective?.name ?? "Objetivo");

  return (
    <div className="space-y-5" data-testid="portfolio-objectives">
      {loading && !data && (
        <div
          role="status"
          aria-label="Carregando objetivos"
          aria-busy="true"
          className="space-y-4"
        >
          <span className="sr-only">Carregando objetivos…</span>
          <div className="rounded-xl border p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="mt-5 h-36 w-full sm:h-44" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-xl border p-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-5 h-8 w-36" />
                <Skeleton className="mt-4 h-2 w-full" />
                <Skeleton className="mt-4 h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      )}
      {objectivesQuery.error && !data && (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>{objectivesQuery.error.message}</p>
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
          />
        </>
      )}
      {data && view.kind !== "overview" && (
        <section
          aria-labelledby="objective-subview-title"
          className="space-y-4"
        >
          <div className="sticky top-0 z-20 flex items-start gap-3 border-b bg-background pb-3 pt-2 shadow-sm">
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
            <div className="min-w-0 space-y-1">
              <h2
                id="objective-subview-title"
                className="text-base font-semibold"
              >
                {subviewTitle}
              </h2>
              {view.kind === "reserve-settings" && (
                <p className="text-sm text-muted-foreground">
                  Atualize o custo mensal e a meta em meses da Reserva.
                </p>
              )}
            </div>
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
