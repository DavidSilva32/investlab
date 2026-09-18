import Link from "next/link";
import {
  CalendarDays,
  ChartNoAxesCombined,
  PieChart,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
          icon={ChartNoAxesCombined}
          label="Ativos acompanhados"
          value={String(positions.length)}
          detail={
            positions.length
              ? "Posições da última importação B3"
              : "Nenhuma posição importada"
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
      <div className="mt-3 flex justify-end">
        <Link
          href="/portfolio"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ver carteira completa
        </Link>
      </div>
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
