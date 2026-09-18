import Link from "next/link";
import { CalendarDays, PieChart, WalletCards } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  getPortfolioInsights,
  type PortfolioInsightPosition,
} from "@/lib/portfolio-insights";
import { formatCurrency } from "@/lib/utils";
import { ReferenceRates } from "@/components/reference-rates";
import type { BcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardSummary({
  positions,
  referenceRates,
}: {
  positions: PortfolioInsightPosition[];
  referenceRates?: BcbReferenceRates;
}) {
  const insights = getPortfolioInsights(positions);
  const nextMaturity = insights.upcomingMaturities[0];
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={WalletCards}
          label="Patrimônio atual"
          value={
            insights.valuedPositions ? formatCurrency(insights.totalValue) : "—"
          }
          detail={
            insights.valuedPositions
              ? "Valor da última posição B3"
              : "Importe uma posição para começar"
          }
        />
        <SummaryCard
          icon={PieChart}
          label="Maior exposição"
          value={
            insights.largestPosition
              ? `${insights.largestPosition.percentage.toFixed(1)}%`
              : "—"
          }
          detail={
            insights.largestPosition
              ? insights.largestPosition.product
              : "Ainda sem valores atuais"
          }
        />
        <SummaryCard
          icon={CalendarDays}
          label="Próximo vencimento"
          value={
            nextMaturity
              ? date.format(new Date(`${nextMaturity.maturityAt}T00:00:00Z`))
              : "—"
          }
          detail={
            nextMaturity ? nextMaturity.product : "Nenhum vencimento informado"
          }
        />
      </section>
      {referenceRates && (
        <div className="mt-4">
          <ReferenceRates rates={referenceRates} />
        </div>
      )}
      <section className="mt-5 grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Próximo passo</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-base font-medium">
              Entenda sua carteira antes de decidir.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Veja distribuição por instituição, concentração e vencimentos na
              visão completa da carteira.
            </p>
            <Link
              href="/portfolio"
              className="mt-4 inline-flex text-sm font-medium text-primary hover:underline"
            >
              Abrir visão da carteira
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Dados importados</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {positions.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              posições na última importação B3
            </p>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function SummaryCard({
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
