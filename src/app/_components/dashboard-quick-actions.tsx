"use client";

import { Plus, Target, Upload } from "lucide-react";
import type { PortfolioPosition } from "@/app/portfolio/_components/portfolio-overview";
import { PortfolioObjectives } from "@/app/portfolio/_components/portfolio-objectives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PortfolioImport } from "@/components/portfolio-import";
import { ManualPositionManager } from "@/app/portfolio/_components/manual-position-manager";

export function DashboardQuickActions({
  positions,
  objectivesOpen,
  onObjectivesOpenChange,
  objectivesNavigation,
  onObjectivesNavigationChange,
  importOpen,
  onImportOpenChange,
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
}) {
  return (
    <section aria-labelledby="dashboard-quick-actions-title">
      <Card className="motion-content-reveal">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <h2 id="dashboard-quick-actions-title" className="font-semibold">
            Ações rápidas
          </h2>
          <div className="grid gap-2 sm:grid-cols-3">
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
            <Sheet open={importOpen} onOpenChange={onImportOpenChange}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 justify-start gap-2 sm:justify-center"
                >
                  <Upload aria-hidden="true" className="size-4" />
                  Importar e conciliar
                </Button>
              </SheetTrigger>
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
                  <PortfolioImport />
                </div>
              </SheetContent>
            </Sheet>
            <Sheet open={objectivesOpen} onOpenChange={onObjectivesOpenChange}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12 justify-start gap-2 sm:justify-center"
                >
                  <Target aria-hidden="true" className="size-4" />
                  Ver objetivos
                </Button>
              </SheetTrigger>
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
          </div>
          <p className="text-xs text-muted-foreground">
            A conciliação com posições existentes aparece durante a revisão da
            importação, quando houver correspondência.
          </p>
        </CardContent>
      </Card>
      <ManualPositionManager positions={positions} entryOnly />
    </section>
  );
}
