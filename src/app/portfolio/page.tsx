export const dynamic = "force-dynamic";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Landmark,
  PieChart,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { importRepository } from "@/backend/repositories/import.repository";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { getPortfolioInsights } from "@/lib/portfolio-insights";
import { formatCurrency, formatQuantity } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
type Position = {
  id: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  indexer: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
  quantity: string;
  totalValue: string | null;
};
type Movement = {
  id: string;
  direction: string;
  occurredAt: string;
  movementType: string;
  product: string;
  assetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
};
const textValue = (value: string | null) => value ?? "";
const numberValue = (value: string | null) =>
  value === null ? null : Number(value);
const dateValue = (value: string | null) =>
  value === null ? null : new Date(`${value}T00:00:00Z`).getTime();
const positionColumns: PortfolioTableColumn<Position>[] = [
  {
    id: "product",
    label: "Produto",
    width: "22%",
    value: (row) => row.product,
    render: (row) => (
      <div>
        <span className="font-medium">{row.product}</span>
        {row.indexer && (
          <span className="block text-xs text-muted-foreground">
            {row.indexer}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "assetCode",
    label: "Código",
    width: "12%",
    value: (row) => textValue(row.assetCode),
    render: (row) => row.assetCode ?? "—",
  },
  {
    id: "quantity",
    label: "Quantidade",
    width: "13%",
    className: "text-right",
    value: (row) => Number(row.quantity),
    render: (row) => formatQuantity(Number(row.quantity)),
  },
  {
    id: "institution",
    label: "Instituição",
    width: "16%",
    value: (row) => textValue(row.institution),
    render: (row) => row.institution ?? "—",
  },
  {
    id: "issuedAt",
    label: "Emissão",
    width: "12%",
    value: (row) => dateValue(row.issuedAt),
    render: (row) =>
      row.issuedAt ? date.format(new Date(`${row.issuedAt}T00:00:00Z`)) : "—",
  },
  {
    id: "maturityAt",
    label: "Vencimento",
    width: "12%",
    value: (row) => dateValue(row.maturityAt),
    render: (row) =>
      row.maturityAt
        ? date.format(new Date(`${row.maturityAt}T00:00:00Z`))
        : "—",
  },
  {
    id: "totalValue",
    label: "Valor atual",
    width: "13%",
    className: "text-right",
    value: (row) => numberValue(row.totalValue),
    render: (row) =>
      row.totalValue ? formatCurrency(Number(row.totalValue)) : "—",
  },
];
const movementColumns: PortfolioTableColumn<Movement>[] = [
  {
    id: "occurredAt",
    label: "Data",
    width: "12%",
    value: (row) => new Date(`${row.occurredAt}T00:00:00Z`).getTime(),
    render: (row) => date.format(new Date(`${row.occurredAt}T00:00:00Z`)),
  },
  {
    id: "movementType",
    label: "Tipo",
    width: "17%",
    value: (row) => row.movementType,
    render: (row) => (
      <Badge>
        {row.direction === "CREDITO" ? "Crédito" : "Débito"} ·{" "}
        {row.movementType}
      </Badge>
    ),
  },
  {
    id: "product",
    label: "Produto / código",
    width: "22%",
    value: (row) => row.product,
    render: (row) => (
      <div>
        <span className="font-medium">{row.product}</span>
        {row.assetCode && (
          <span className="block text-xs text-muted-foreground">
            {row.assetCode}
          </span>
        )}
      </div>
    ),
  },
  {
    id: "institution",
    label: "Instituição",
    width: "14%",
    value: (row) => textValue(row.institution),
    render: (row) => row.institution ?? "—",
  },
  {
    id: "quantity",
    label: "Quantidade",
    width: "12%",
    className: "text-right",
    value: (row) => Number(row.quantity),
    render: (row) => formatQuantity(Number(row.quantity)),
  },
  {
    id: "unitPrice",
    label: "Preço unitário",
    width: "12%",
    className: "text-right",
    value: (row) => numberValue(row.unitPrice),
    render: (row) =>
      row.unitPrice ? formatCurrency(Number(row.unitPrice)) : "—",
  },
  {
    id: "operationValue",
    label: "Valor",
    width: "11%",
    className: "text-right",
    value: (row) => numberValue(row.operationValue),
    render: (row) =>
      row.operationValue ? formatCurrency(Number(row.operationValue)) : "—",
  },
];

function Overview({ positions }: { positions: Position[] }) {
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
              ? "Valor da última posição B3"
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
              Alocação por instituição, usando o valor atual informado pela B3.
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

export default async function PortfolioPage({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ view?: string }> } = {}) {
  const { view } = await searchParams;
  const activeView =
    view === "positions" || view === "movements" ? view : "overview";
  const [positions, movements] = await Promise.all([
    importRepository.listLatestPositions(),
    importRepository.listMovements(),
  ]);
  return (
    <AppShell title="Carteira">
      <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Uma leitura objetiva da sua carteira, baseada na última posição B3
            importada.
          </p>
        </div>
        <Link
          href="/imports"
          className="text-sm font-medium text-primary hover:underline"
        >
          Importar dados
        </Link>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        <PortfolioLink href="/portfolio" active={activeView === "overview"}>
          Visão geral
        </PortfolioLink>
        <PortfolioLink
          href="/portfolio?view=positions"
          active={activeView === "positions"}
        >
          Posições
        </PortfolioLink>
        <PortfolioLink
          href="/portfolio?view=movements"
          active={activeView === "movements"}
        >
          Movimentações
        </PortfolioLink>
      </div>
      {activeView === "overview" ? (
        <Overview positions={positions} />
      ) : activeView === "positions" ? (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Posições atuais</CardTitle>
                <CardDescription>
                  {positions.length
                    ? `${positions.length} posições disponíveis`
                    : "Nenhuma posição importada"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {positions.length > 0 && (
                  <Badge>{positions.length} ativos</Badge>
                )}
                <DeleteImportedDataButton
                  documentType="B3_POSITION_XLSX"
                  label="posições"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <PortfolioTable
              columns={positionColumns}
              rows={positions}
              initialSort={{ id: "product", direction: "asc" }}
              emptyMessage="Importe um arquivo B3 para visualizar suas posições."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Movimentações</CardTitle>
                <CardDescription>
                  {movements.length
                    ? `${movements.length} movimentações importadas`
                    : "Nenhuma movimentação importada"}
                </CardDescription>
              </div>
              <DeleteImportedDataButton
                documentType="B3_MOVEMENT_XLSX"
                label="movimentações"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <PortfolioTable
              columns={movementColumns}
              rows={movements}
              initialSort={{ id: "occurredAt", direction: "desc" }}
              emptyMessage="Importe um arquivo de movimentações da B3 para visualizá-las."
            />
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
function PortfolioLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
