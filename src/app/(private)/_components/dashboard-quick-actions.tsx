"use client";

import { Plus, Target, Upload } from "lucide-react";
import { DashboardFirstAccess } from "@/app/(private)/_components/dashboard-first-access";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-overview";
import { PortfolioObjectives } from "@/app/(private)/portfolio/_components/portfolio-objectives";
import { ManualPositionManager } from "@/app/(private)/portfolio/_components/manual-position-manager";
import { PortfolioImport } from "@/components/portfolio-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function DashboardQuickActions({
  positions,
  objectivesOpen,
  onObjectivesOpenChange,
  objectivesNavigation,
  onObjectivesNavigationChange,
  importOpen,
  onImportOpenChange,
  firstAccess = false,
  supportReadOnly = false,
  supportChecking = false,
  supportCheckError = false,
  onRetrySupportCheck = () => {},
}: {
  positions: PortfolioPosition[];
  objectivesOpen: boolean;
  onObjectivesOpenChange: (open: boolean) => void;
  objectivesNavigation?: {
    open: boolean;
    objectiveId: string | null;
    screen: string | null;
  };
  onObjectivesNavigationChange?: (
    objectiveId: string | null,
    screen?: string | null,
  ) => void;
  importOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  firstAccess?: boolean;
  supportReadOnly?: boolean;
  supportChecking?: boolean;
  supportCheckError?: boolean;
  onRetrySupportCheck?: () => void;
}) {
  const actionsEnabled =
    !supportReadOnly && !supportChecking && !supportCheckError;
  const readOnly = !actionsEnabled;
  return (
    <Sheet
      open={importOpen && actionsEnabled}
      onOpenChange={onImportOpenChange}
    >
      <>
        {firstAccess ? (
          <DashboardFirstAccess
            readOnly={readOnly}
            contextPending={supportChecking}
            contextError={supportCheckError}
            onRetryContext={onRetrySupportCheck}
            onImport={() => onImportOpenChange(true)}
            onCreateManual={() =>
              window.dispatchEvent(
                new Event("portfolio:manual-position:create"),
              )
            }
          />
        ) : (
          <section aria-labelledby="dashboard-quick-actions-title">
            <Card className="motion-content-reveal">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <h2
                  id="dashboard-quick-actions-title"
                  className="font-semibold"
                >
                  Ações rápidas
                </h2>
                <div className="grid gap-2 sm:grid-cols-3">
                  {actionsEnabled && (
                    <>
                      <Button
                        type="button"
                        className="min-h-12 justify-start gap-2 sm:justify-center"
                        onClick={() =>
                          window.dispatchEvent(
                            new Event("portfolio:manual-position:create"),
                          )
                        }
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Adicionar posição
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-12 justify-start gap-2 sm:justify-center"
                        onClick={() => onImportOpenChange(true)}
                      >
                        <Upload aria-hidden="true" className="size-4" />
                        Importar e conciliar
                      </Button>
                    </>
                  )}
                  {actionsEnabled && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12 justify-start gap-2 sm:justify-center"
                      onClick={() => onObjectivesOpenChange(true)}
                    >
                      <Target aria-hidden="true" className="size-4" />
                      Ver objetivos
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  A conciliação com posições existentes aparece durante a
                  revisão da importação, quando houver correspondência.
                </p>
              </CardContent>
            </Card>
          </section>
        )}
        <SheetContent
          side="right"
          className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden p-4 sm:max-w-6xl sm:p-6"
        >
          <SheetHeader className="mb-5 shrink-0 pr-8">
            <SheetTitle>Importar e conciliar</SheetTitle>
            <SheetDescription>
              Revise os dados do arquivo e escolha como tratar cada
              correspondência antes de confirmar.
            </SheetDescription>
          </SheetHeader>
          <div
            aria-label="Importação e conciliação"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
            role="region"
          >
            <PortfolioImport readOnly={readOnly} />
          </div>
        </SheetContent>
        <Sheet
          open={objectivesOpen && actionsEnabled}
          onOpenChange={onObjectivesOpenChange}
        >
          <SheetContent
            side="right"
            className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden sm:max-w-3xl"
          >
            <SheetHeader className="mb-5 shrink-0 pr-8">
              <SheetTitle>Objetivos e destinos</SheetTitle>
              <SheetDescription>
                Consulte e organize os objetivos da sua carteira.
              </SheetDescription>
            </SheetHeader>
            <div
              aria-label="Objetivos e destinos da carteira"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
              role="region"
            >
              <PortfolioObjectives
                navigation={
                  objectivesNavigation ?? {
                    open: objectivesOpen,
                    objectiveId: null,
                    screen: null,
                  }
                }
                onNavigationChange={onObjectivesNavigationChange}
              />
            </div>
          </SheetContent>
        </Sheet>
        {actionsEnabled && (
          <ManualPositionManager positions={positions} entryOnly />
        )}
      </>
    </Sheet>
  );
}
