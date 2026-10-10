"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Info, WalletCards } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardObservations({
  insights,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
}) {
  const nextMaturity = insights.upcomingMaturities[0];
  const largestPosition = insights.largestPosition;
  if (!largestPosition && !nextMaturity) return null;

  const facts = [
    ...(largestPosition
      ? [
          {
            icon: WalletCards,
            title: "Maior posição",
            product: largestPosition.product,
            value: `${largestPosition.percentage.toFixed(1)}%`,
            explanation:
              "Participação no valor conhecido. Distribuição não mede risco.",
          },
        ]
      : []),
    ...(nextMaturity
      ? [
          {
            icon: CalendarDays,
            title: "Próximo vencimento",
            product: nextMaturity.product,
            value: date.format(
              new Date(`${nextMaturity.maturityAt}T00:00:00Z`),
            ),
            explanation:
              "Vencimento informado não confirma disponibilidade do dinheiro.",
          },
        ]
      : []),
  ];

  return (
    <section aria-label="Fatos da carteira">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
          <TooltipProvider delayDuration={0}>
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div
                    key={fact.title}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{fact.title}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={fact.explanation}
                              className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <Info aria-hidden="true" className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-64 motion-reduce:animate-none">
                            {fact.explanation}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
                        <span
                          className="truncate text-sm font-medium"
                          title={fact.product}
                        >
                          {fact.product}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                          {fact.value}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>
          <Link
            href="/portfolio?view=positions"
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver posições <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
