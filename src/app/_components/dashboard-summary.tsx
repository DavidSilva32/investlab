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
import { EmergencyReserveSummary } from "@/app/_components/emergency-reserve-summary";
import type { EmergencyReserveCalculation } from "@/lib/emergency-reserve";
import type { BcbReferenceRates } from "@/backend/services/bcb-reference-rates.service";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export function DashboardSummary({
  positions,
  referenceRates,
  emergencyReserve,
}: {
  positions: PortfolioInsightPosition[];
  referenceRates?: BcbReferenceRates;
  emergencyReserve?: EmergencyReserveCalculation;
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
      <section className="mt-4">
        <EmergencyReserveSummary calculation={emergencyReserve} />
      </section>
      {referenceRates && (
        <div className="mt-4">
          <ReferenceRates rates={referenceRates} />
        </div>
      )}
      <section
        aria-labelledby="dashboard-next-steps"
        className="mt-8 space-y-4"
      >
        <div>
          <h2 id="dashboard-next-steps" className="text-lg font-semibold">
            Próximos passos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Atalhos para revisar os dados importados e seguir seu estudo.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-5">
              <h3 className="font-medium">
                {positions.length
                  ? "Revise sua carteira"
                  : "Importe sua carteira"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {positions.length
                  ? "Confira posições, concentração e vencimentos da última importação."
                  : "Os indicadores do resumo dependem de uma posição importada da B3."}
              </p>
              <Link
                href={positions.length ? "/portfolio" : "/imports"}
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                {positions.length ? "Abrir carteira" : "Ir para Importações"}
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-5">
              <h3 className="font-medium">Empresas em estudo</h3>
              <p className="text-sm text-muted-foreground">
                Consulte critérios e fontes antes de decidir se quer aprofundar
                uma análise.
              </p>
              <Link
                href="/analyses"
                className="inline-block text-sm font-medium text-primary hover:underline"
              >
                Abrir Descobrir
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
      <div className="mt-4 flex justify-end">
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
