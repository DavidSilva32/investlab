"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CdiRateIndicator } from "./cdi-rate-indicator";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import type { PortfolioPosition } from "./portfolio-overview";
import { CdbRateConfiguration } from "./cdb-rate-configuration";

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

export type PortfolioMovement = {
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

const positionColumns: PortfolioTableColumn<PortfolioPosition>[] = [
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
    width: "18%",
    className: "text-right",
    value: (row) => row.estimatedValue ?? numberValue(row.totalValue),
    render: (row) => {
      const isDiCdb =
        /^CDB\b/i.test(row.product) && /^(DI|CDI)$/i.test(row.indexer ?? "");
      if (!row.totalValue) return "—";
      if (row.estimatedValue !== null && row.estimatedValue !== undefined)
        return (
          <div className="space-y-1">
            <span className="font-medium">
              {formatCurrency(row.estimatedValue)}
            </span>
            <span className="block text-xs text-muted-foreground">
              {row.cdbEstimateStatus === "provisional" &&
              row.estimatedThrough ? (
                <>
                  Estimativa provisória até{" "}
                  {date.format(new Date(`${row.estimatedThrough}T00:00:00Z`))}
                </>
              ) : (
                "Valor estimado hoje"
              )}
            </span>
            {row.cdbEstimateStatus === "provisional" && (
              <span className="block text-xs text-amber-700 dark:text-amber-400">
                Não foi possível confirmar o CDI oficial agora. Sujeita a
                ajuste.
              </span>
            )}
            {isDiCdb && <CdiRateIndicator percentage={row.cdiPercentage} />}
            <span className="block text-xs text-muted-foreground">
              Último valor informado pela B3:{" "}
              {formatCurrency(Number(row.totalValue))}
              {row.estimationBaseDate
                ? ` · arquivo de ${date.format(new Date(`${row.estimationBaseDate}T00:00:00Z`))}`
                : ""}
            </span>
            {isDiCdb && row.assetCode && (
              <CdbRateConfiguration
                assetCode={row.assetCode}
                currentPercentage={row.cdiPercentage}
              />
            )}
          </div>
        );
      if (isDiCdb && row.assetCode)
        return (
          <div className="space-y-1">
            <span className="block font-medium">
              {formatCurrency(Number(row.totalValue))}
            </span>
            <span className="block text-xs text-muted-foreground">
              Último valor informado pela B3
            </span>
            {row.cdbEstimateStatus === "unavailable" && (
              <span className="block text-xs text-amber-700 dark:text-amber-400">
                Não foi possível atualizar a estimativa com o CDI oficial.
              </span>
            )}
            {isDiCdb && <CdiRateIndicator percentage={row.cdiPercentage} />}
            <CdbRateConfiguration
              assetCode={row.assetCode}
              currentPercentage={row.cdiPercentage}
            />
          </div>
        );
      return (
        <div>
          <span className="font-medium">
            {formatCurrency(Number(row.totalValue))}
          </span>
          <span className="block text-xs text-muted-foreground">
            Último valor informado pela B3
          </span>
        </div>
      );
    },
  },
];
const movementColumns: PortfolioTableColumn<PortfolioMovement>[] = [
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

export function PositionDetails({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Posições atuais</CardTitle>
            <CardDescription>
              {positions.length
                ? `${positions.length} posições disponíveis`
                : "Nenhuma posição importada"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {positions.length > 0 && <Badge>{positions.length} ativos</Badge>}
            <CdbRateConfiguration
              assetCodes={positions
                .filter(
                  (position) =>
                    position.assetCode &&
                    /^CDB\b/i.test(position.product) &&
                    /^(DI|CDI)$/i.test(position.indexer ?? ""),
                )
                .map((position) => position.assetCode!)}
            />
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
  );
}

export function MovementDetails({
  movements,
}: {
  movements: PortfolioMovement[];
}) {
  return (
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
  );
}
