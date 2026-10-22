"use client";

import { useState } from "react";
import { ArrowRight, BookOpenText, Plus, Target, Upload } from "lucide-react";
import Link from "next/link";
import { DashboardFirstAccess } from "@/app/(private)/_components/dashboard-first-access";
import type { PortfolioPosition } from "@/app/(private)/portfolio/_components/portfolio-overview";
import { PortfolioObjectives } from "@/app/(private)/portfolio/_components/portfolio-objectives";
import { ManualPositionManager } from "@/app/(private)/portfolio/_components/manual-position-manager";
import { PortfolioImport } from "@/components/portfolio-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const actionsEnabled =
    !supportReadOnly && !supportChecking && !supportCheckError;
  const readOnly = !actionsEnabled;

  if (!firstAccess && readOnly) return null;

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
                <div className="flex items-center justify-between gap-2">
                  <h2
                    id="dashboard-quick-actions-title"
                    className="font-semibold"
                  >
                    Ações rápidas
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-mr-2 gap-1.5 text-primary"
                    onClick={() => setGuideOpen(true)}
                  >
                    <BookOpenText aria-hidden="true" className="size-4" />
                    Como começar
                  </Button>
                </div>
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
        <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Comece pela sua carteira</DialogTitle>
              <DialogDescription>
                Três passos simples para começar a usar o InvestLab.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3">
              <li className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  1
                </span>
                <div className="space-y-1">
                  <p className="font-medium">Traga seus investimentos</p>
                  <p className="text-sm text-muted-foreground">
                    Importe o arquivo de posições da B3 ou cadastre uma posição
                    manualmente.
                  </p>
                  <a
                    href="https://www.investidor.b3.com.br/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    Acessar Área do Investidor da B3
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  2
                </span>
                <div>
                  <p className="font-medium">Defina o que importa para você</p>
                  <p className="text-sm text-muted-foreground">
                    Organize objetivos e estratégia de acordo com seus planos.
                  </p>
                  <Link
                    href="/planejamento"
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    onClick={() => setGuideOpen(false)}
                  >
                    Conhecer o planejamento
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </li>
              <li className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  3
                </span>
                <div>
                  <p className="font-medium">Acompanhe os próximos passos</p>
                  <p className="text-sm text-muted-foreground">
                    O dashboard ajuda a entender sua carteira e o que merece
                    atenção.
                  </p>
                </div>
              </li>
            </ol>
            {actionsEnabled && (
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setGuideOpen(false);
                    window.dispatchEvent(
                      new Event("portfolio:manual-position:create"),
                    );
                  }}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Cadastrar manualmente
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setGuideOpen(false);
                    onImportOpenChange(true);
                  }}
                >
                  <Upload aria-hidden="true" className="size-4" />
                  Importar arquivo da B3
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
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
