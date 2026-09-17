export const dynamic = "force-dynamic";
import Link from "next/link";
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
import { formatCurrency, formatQuantity } from "@/lib/utils";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
type Position = {
  id: string;
  product: string;
  assetCode: string | null;
  quantity: string;
  institution: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
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
    render: (row) => <span className="font-medium">{row.product}</span>,
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
      <>
        <span className="font-medium">{row.product}</span>
        {row.assetCode && (
          <span className="block text-xs text-muted-foreground">
            {row.assetCode}
          </span>
        )}
      </>
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

export default async function PortfolioPage({
  searchParams = Promise.resolve({}),
}: { searchParams?: Promise<{ view?: string }> } = {}) {
  const { view } = await searchParams;
  const movementsView = view === "movements";
  const [positions, movements] = await Promise.all([
    importRepository.listLatestPositions(),
    importRepository.listMovements(),
  ]);
  return (
    <AppShell title="Carteira">
      <div className="mb-7">
        <p className="text-sm text-muted-foreground">
          Acompanhe suas posições e movimentações importadas da B3.
        </p>
      </div>
      <div className="mb-5 flex gap-2 border-b">
        <Link
          href="/portfolio"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${!movementsView ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Posições
        </Link>
        <Link
          href="/portfolio?view=movements"
          className={`border-b-2 px-3 py-2 text-sm font-medium ${movementsView ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
        >
          Movimentações
        </Link>
      </div>
      {movementsView ? (
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
      ) : (
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
      )}
    </AppShell>
  );
}
