import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Info,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import type {
  PortfolioInsightPosition,
  PortfolioInsights,
} from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardObservations({
  positions,
  insights,
  emergencyReserve,
}: {
  positions: PortfolioInsightPosition[];
  insights: PortfolioInsights;
  emergencyReserve?: EmergencyReserveCalculation;
}) {
  const missingValueCount = insights.unvaluedPositions;
  const nextMaturity = insights.upcomingMaturities[0];
  const reserveIncomplete = Boolean(
    emergencyReserve &&
    (emergencyReserve.unvaluedGroups > 0 ||
      (emergencyReserve.missingSelectionCount ?? 0) > 0),
  );
  const attentionItems = [
    ...(reserveIncomplete
      ? [
          {
            icon: CircleAlert,
            title: "Os dados da reserva estão incompletos",
            detail:
              "Há valores ausentes ou seleções que não correspondem às posições atuais. Confira os dados antes de tirar conclusões sobre a cobertura.",
          },
        ]
      : []),
    ...(!reserveIncomplete &&
    emergencyReserve?.status === "below_target" &&
    emergencyReserve.difference !== null
      ? [
          {
            icon: CircleAlert,
            title: "A reserva está abaixo da sua meta pessoal",
            detail: `A diferença é ${formatCurrency(emergencyReserve.difference)}. Essa meta foi definida por você; não é uma recomendação do InvestLab.`,
          },
        ]
      : []),
  ];
  const portfolioFacts = [
    ...(insights.largestPosition
      ? [
          {
            icon: WalletCards,
            title: "Maior posição na carteira conhecida",
            detail: `${insights.largestPosition.product} representa ${insights.largestPosition.percentage.toFixed(1)}% do valor conhecido. Isso descreve a distribuição; não classifica o nível de risco.`,
          },
        ]
      : []),
    ...(nextMaturity
      ? [
          {
            icon: CalendarDays,
            title: "Próximo vencimento informado",
            detail: `${nextMaturity.product} · ${date.format(new Date(`${nextMaturity.maturityAt}T00:00:00Z`))}. O vencimento é uma data registrada e não confirma quando o dinheiro ficará disponível.`,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid gap-6 ${portfolioFacts.length > 0 ? "xl:grid-cols-2" : "grid-cols-1"}`}
    >
      <section
        aria-labelledby="dashboard-attention-title"
        className="space-y-3"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2
              id="dashboard-attention-title"
              className="text-xl font-semibold"
            >
              O que merece atenção
            </h2>
          </div>
          {positions.length > 0 && (
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Ver carteira <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
        {attentionItems.length ? (
          <div className="grid gap-3">
            {attentionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex gap-3 p-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-status-warning/10 text-status-warning">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <Info aria-hidden="true" className="size-4 shrink-0" />
              {missingValueCount > 0
                ? "A leitura fica limitada enquanto houver posições sem valor atual."
                : positions.length === 0
                  ? "Ainda não há posições conhecidas para identificar pontos de atenção."
                  : "Não há pontos de atenção identificados com os dados disponíveis."}
            </CardContent>
          </Card>
        )}
      </section>

      {portfolioFacts.length > 0 && (
        <section aria-labelledby="dashboard-facts-title" className="space-y-3">
          <div>
            <h2 id="dashboard-facts-title" className="text-xl font-semibold">
              Fatos da carteira
            </h2>
          </div>
          <div className="grid gap-3">
            {portfolioFacts.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex gap-3 p-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
