import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Landmark,
  PieChart,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export type PortfolioPosition = {
  id: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  indexer: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  quantity: string;
  totalValue: string | null;
  estimationBaseDate?: string | null;
  cdiPercentage?: string | null;
  estimatedValue?: number | null;
  estimatedThrough?: string | null;
  cdbEstimateStatus?: "official" | "provisional" | "unavailable" | null;
};

export function PortfolioOverview({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
  const insights = getPortfolioInsights(positions);
  const nextMaturity = insights.upcomingMaturities[0];
  const concentration = insights.largestPosition;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={WalletCards}
          label="Patrimônio atual"
          value={
            insights.valuedPositions ? formatCurrency(insights.totalValue) : "—"
          }
          detail={
            insights.valuedPositions
              ? "Valor estimado com CDI quando disponível"
              : "Importe uma posição para começar"
          }
        />
        <Metric
          icon={PieChart}
          label="Ativos acompanhados"
          value={String(positions.length)}
          detail={`${insights.valuedPositions} com valor atual`}
        />
        <Metric
          icon={Landmark}
          label="Instituições"
          value={String(insights.institutions)}
          detail={
            insights.institutions
              ? "Com valor alocado"
              : "Sem valor alocado ainda"
          }
        />
        <Metric
          icon={CalendarDays}
          label="Próximo vencimento"
          value={
            nextMaturity
              ? date.format(new Date(`${nextMaturity.maturityAt}T00:00:00Z`))
              : "—"
          }
          detail={
            nextMaturity
              ? nextMaturity.product
              : "Nenhum vencimento futuro informado"
          }
        />
      </section>
      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Como seu patrimônio está distribuído</CardTitle>
            <CardDescription>
              Alocação por instituição, com estimativa CDI quando disponível.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.allocations.length ? (
              <div className="space-y-5">
                {insights.allocations.map((allocation) => (
                  <div key={allocation.institution}>
                    <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
                      <span className="truncate font-medium">
                        {allocation.institution}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {allocation.percentage.toFixed(1)}% ·{" "}
                        {formatCurrency(allocation.value)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${allocation.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyInsight message="Ainda não há valores atuais para mostrar a alocação." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>O que merece sua atenção</CardTitle>
            <CardDescription>
              Sinais objetivos a partir da posição importada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {concentration ? (
              <Insight
                icon={ShieldAlert}
                title={
                  concentration.percentage >= 50
                    ? "Concentração relevante"
                    : "Maior exposição"
                }
                description={`${concentration.product} representa ${concentration.percentage.toFixed(1)}% do patrimônio atual.`}
              />
            ) : (
              <EmptyInsight message="Importe uma posição com valor atual para analisar concentração." />
            )}
            {nextMaturity && (
              <Insight
                icon={CalendarDays}
                title="Vencimento mais próximo"
                description={`${nextMaturity.product} vence em ${date.format(new Date(`${nextMaturity.maturityAt}T00:00:00Z`))}.`}
              />
            )}
            {insights.institutions > 1 && (
              <Insight
                icon={Landmark}
                title="Diversificação institucional"
                description={`Seu patrimônio está distribuído entre ${insights.institutions} instituições.`}
              />
            )}
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Próximos vencimentos</CardTitle>
            <CardDescription>
              Planeje liquidez e reinvestimento antes da data.
            </CardDescription>
          </div>
          <Link
            href="/portfolio?view=positions"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver posições <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {insights.upcomingMaturities.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {insights.upcomingMaturities.map((position) => (
                <div
                  key={`${position.product}-${position.maturityAt}`}
                  className="rounded-lg border bg-muted/25 p-4"
                >
                  <p className="truncate font-medium">{position.product}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Vence em{" "}
                    {date.format(new Date(`${position.maturityAt}T00:00:00Z`))}
                  </p>
                  <p className="mt-3 text-sm font-medium tabular-nums">
                    {position.value === null
                      ? "Valor não informado"
                      : formatCurrency(position.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInsight message="Não há vencimentos futuros informados nas posições atuais." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof WalletCards;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
function Insight({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldAlert;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
function EmptyInsight({ message }: { message: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{message}</p>;
}
