import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Info,
  WalletCards,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPortfolioInsights,
  type PortfolioInsightPosition,
} from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import { ContributionAssistant } from "@/app/_components/contribution-assistant";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardSummary({
  positions,
  emergencyReserve,
}: {
  positions: PortfolioInsightPosition[];
  emergencyReserve?: EmergencyReserveCalculation;
}) {
  const insights = getPortfolioInsights(positions);
  const referenceDates = [
    ...new Set(
      positions
        .map((position) => position.referenceDate)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const referenceDate =
    referenceDates.length === 1 &&
    positions.length > 0 &&
    positions.every((position) => position.referenceDate === referenceDates[0])
      ? referenceDates[0]
      : null;
  const dataDateIsMixed = referenceDates.length > 0 && referenceDate === null;
  const missingValueCount = positions.length - insights.valuedPositions;
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
            tone: "attention" as const,
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
            tone: "attention" as const,
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

  const nextAction = getNextAction({
    positionCount: positions.length,
    missingValueCount,
    reserveIncomplete,
    reserve: emergencyReserve,
  });

  return (
    <div className="space-y-5">
      <section aria-labelledby="dashboard-where-am-i">
        <Card className="overflow-hidden border-primary/20 shadow-sm">
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Onde você está
                </p>
                <h2
                  id="dashboard-where-am-i"
                  className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl"
                >
                  {insights.valuedPositions
                    ? formatCurrency(insights.totalValue)
                    : "Ainda sem valores conhecidos"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Patrimônio da carteira que o InvestLab conhece
                </p>
              </div>
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <WalletCards aria-hidden="true" className="size-5" />
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
              <span>
                <strong className="tabular-nums">
                  {insights.valuedPositions} de {positions.length}
                </strong>{" "}
                posições com valor
              </span>
              {referenceDate ? (
                <span className="text-muted-foreground">
                  Dados de {date.format(new Date(`${referenceDate}T00:00:00Z`))}
                </span>
              ) : dataDateIsMixed ? (
                <span className="text-muted-foreground">
                  Datas-base variadas ou incompletas
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Data-base não informada
                </span>
              )}
              {missingValueCount > 0 && (
                <span className="text-amber-800 dark:text-amber-300">
                  {missingValueCount} sem valor atual
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="dashboard-reserve-title">
        <EmergencyReserveSummary calculation={emergencyReserve} />
      </section>

      <ContributionAssistant />

      <section
        aria-labelledby="dashboard-attention-title"
        className="space-y-3"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Leitura da carteira
            </p>
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
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver carteira <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
        {attentionItems.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {attentionItems.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title}>
                  <CardContent className="flex gap-3 p-4">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
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
            <p className="text-sm font-medium text-muted-foreground">
              Dados registrados
            </p>
            <h2 id="dashboard-facts-title" className="text-lg font-semibold">
              Fatos da carteira
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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

      {nextAction && (
        <section aria-labelledby="dashboard-next-action-title">
          <Card className="bg-muted/40">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Próxima ação
                </p>
                <h2
                  id="dashboard-next-action-title"
                  className="mt-1 font-semibold"
                >
                  {nextAction.title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {nextAction.detail}
                </p>
              </div>
              <Link
                href={nextAction.href}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {nextAction.label}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      <Collapsible className="text-sm text-muted-foreground">
        <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-2 rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Como ler estes dados
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 max-w-3xl space-y-2 rounded-lg border p-4">
          <p>
            O patrimônio soma os valores conhecidos das posições. Ativos sem
            valor atual não entram na soma; a data mostrada é a data-base
            registrada para as posições.
          </p>
          <p>
            A participação da maior posição e as datas de vencimento são fatos
            da carteira conhecida. Não determinam, por si só, risco, adequação
            ou uma decisão de investimento.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function getNextAction({
  positionCount,
  missingValueCount,
  reserveIncomplete,
  reserve,
}: {
  positionCount: number;
  missingValueCount: number;
  reserveIncomplete: boolean;
  reserve?: EmergencyReserveCalculation;
}) {
  if (reserveIncomplete) {
    return {
      title: "Revise as posições selecionadas como reserva",
      detail:
        "Há posições sem valor ou seleções que não correspondem à carteira atual.",
      label: "Revisar reserva",
      href: "/portfolio",
    };
  }
  if (positionCount === 0) {
    return {
      title: "Adicione os dados da sua carteira",
      detail: "Sem posições, ainda não há base para interpretar sua situação.",
      label: "Importar carteira",
      href: "/imports",
    };
  }
  if (missingValueCount > 0) {
    return {
      title: "Revise as posições sem valor atual",
      detail:
        "Valores ausentes deixam o total conhecido e a distribuição incompletos.",
      label: "Revisar carteira",
      href: "/portfolio",
    };
  }
  if (
    reserve &&
    (reserve.monthlyExpenses === null || reserve.status === "not_configured")
  ) {
    return {
      title: "Complete a configuração da reserva",
      detail:
        "Informe suas despesas e defina sua meta pessoal para acompanhar a cobertura.",
      label: "Configurar reserva",
      href: "/portfolio",
    };
  }
  return null;
}
