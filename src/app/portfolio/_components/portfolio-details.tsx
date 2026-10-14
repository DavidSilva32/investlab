"use client";

import { AssetLogo } from "@/components/asset-logo";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CdiRateIndicator } from "./cdi-rate-indicator";
import { DeleteImportedDataButton } from "@/components/delete-imported-data-button";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";
import { formatCurrency, formatQuantity } from "@/lib/utils";
import { formatCurrencyCents } from "@/lib/portfolio-money";
import { useState } from "react";
import {
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import type { PortfolioPosition } from "./portfolio-overview";
import { CdbRateConfiguration } from "./cdb-rate-configuration";
import { ManualPositionManager } from "./manual-position-manager";
import { ManualPortfolioOperations } from "./manual-portfolio-operations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
const formatDate = (value: string | null) =>
  value ? date.format(new Date(`${value}T00:00:00Z`)) : "";
const currentValueCents = (row: PortfolioPosition) => {
  const hasEstimate =
    row.estimatedValue !== null && row.estimatedValue !== undefined;
  return row.source === "MANUAL" || hasEstimate
    ? (row.canonicalValueCents ?? null)
    : (row.reportedValueCents ?? null);
};

const positionColumns = (
  onAdjustRate: (position: PortfolioPosition) => void,
): PortfolioTableColumn<PortfolioPosition>[] => [
  {
    id: "product",
    label: "Produto",
    width: "17%",
    value: (row) => row.product,
    searchValue: (row) => [row.product, row.indexer].filter(Boolean).join(" "),
    render: (row) => (
      <div className="flex items-center gap-2">
        <AssetLogo ticker={row.assetCode} name={row.product} size="sm" />
        <div className="min-w-0">
          <span className="font-medium">{row.product}</span>
          {row.indexer && (
            <span className="block text-xs text-muted-foreground">
              {row.indexer}
            </span>
          )}
          {row.source === "MANUAL" &&
            row.informationalCdiPercentage != null && (
              <span className="block text-xs text-muted-foreground">
                Premissa informativa: {Number(row.informationalCdiPercentage)}%
                do CDI. Não usada para calcular rendimento.
              </span>
            )}
        </div>
      </div>
    ),
  },
  {
    id: "assetCode",
    label: "Código",
    width: "10%",
    value: (row) => textValue(row.assetCode),
    searchValue: (row) => row.assetCode,
    render: (row) => row.assetCode ?? "—",
  },
  {
    id: "source",
    label: "Origem",
    width: "9%",
    value: (row) =>
      row.source === "MANUAL" ? "Manual" : row.source === "B3" ? "B3" : "",
    searchValue: (row) =>
      row.source === "MANUAL" ? "Manual" : row.source === "B3" ? "B3" : "",
    render: (row) =>
      row.source === "MANUAL" ? (
        <Badge variant="outline">Manual</Badge>
      ) : row.source === "B3" ? (
        <Badge variant="secondary">B3</Badge>
      ) : (
        "—"
      ),
  },
  {
    id: "quantity",
    label: "Quantidade",
    width: "12%",
    className: "text-right",
    value: (row) => Number(row.quantity),
    searchValue: (row) => formatQuantity(Number(row.quantity)),
    render: (row) => formatQuantity(Number(row.quantity)),
  },
  {
    id: "institution",
    label: "Instituição",
    width: "15%",
    value: (row) => textValue(row.institution),
    searchValue: (row) => row.institution,
    render: (row) => row.institution ?? "—",
  },
  {
    id: "issuedAt",
    label: "Emissão",
    width: "11%",
    value: (row) => dateValue(row.issuedAt),
    searchValue: (row) => formatDate(row.issuedAt),
    render: (row) => formatDate(row.issuedAt) || "—",
  },
  {
    id: "maturityAt",
    label: "Vencimento",
    width: "11%",
    value: (row) => dateValue(row.maturityAt),
    searchValue: (row) => formatDate(row.maturityAt),
    render: (row) => formatDate(row.maturityAt) || "—",
  },
  {
    id: "totalValue",
    label: "Valor atual",
    width: "16%",
    className: "text-right",
    value: (row) => row.canonicalValueCents ?? row.reportedValueCents ?? null,
    searchValue: (row) => formatCurrencyCents(currentValueCents(row)),
    render: (row) => {
      const isDiCdb =
        /^CDB\b/i.test(row.product) && /^(DI|CDI)$/i.test(row.indexer ?? "");
      const hasEstimate =
        row.estimatedValue !== null && row.estimatedValue !== undefined;
      const currentValue = currentValueCents(row);
      const reportedValue = row.reportedTotalValue ?? row.totalValue;

      return (
        <div className="flex items-center justify-end gap-1">
          <span className="font-medium tabular-nums">
            {formatCurrencyCents(currentValue ?? null)}
          </span>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Consultar origem e estimativa de ${row.product}`}
              >
                <Info aria-hidden="true" className="size-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Valor atual de {row.product}</DialogTitle>
                <DialogDescription>
                  Origem do valor e detalhes da estimativa, quando disponíveis.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                {row.source === "MANUAL" ? (
                  <>
                    <p>
                      {row.currency === "BRL"
                        ? "Valor informado manualmente."
                        : reportedValue
                          ? `${Number(reportedValue).toLocaleString("pt-BR")} ${row.currency ?? ""} informado manualmente.`
                          : "Sem conversão para reais."}
                    </p>
                    {row.positionDate && (
                      <p className="text-muted-foreground">
                        Valor observado em{" "}
                        {date.format(new Date(`${row.positionDate}T00:00:00Z`))}
                      </p>
                    )}
                    {row.conversionDate && (
                      <p className="text-muted-foreground">
                        Conversão informada em{" "}
                        {date.format(
                          new Date(`${row.conversionDate}T00:00:00Z`),
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {hasEstimate ? (
                      <>
                        <p className="text-muted-foreground">
                          {row.estimatedThrough
                            ? `${row.cdbEstimateStatus === "provisional" ? "Estimativa parcial até " : "Estimativa até "}${date.format(new Date(`${row.estimatedThrough}T00:00:00Z`))}`
                            : "Valor estimado."}
                        </p>
                        {row.cdbEstimateLimitation && (
                          <p className="text-status-warning">
                            {row.cdbEstimateLimitation}
                          </p>
                        )}
                        {row.cdbProjectedFromDate &&
                          row.cdbProjectedThroughDate && (
                            <p className="text-status-warning">
                              Trecho projetado: de{" "}
                              {date.format(
                                new Date(
                                  `${row.cdbProjectedFromDate}T00:00:00Z`,
                                ),
                              )}{" "}
                              a{" "}
                              {date.format(
                                new Date(
                                  `${row.cdbProjectedThroughDate}T00:00:00Z`,
                                ),
                              )}
                            </p>
                          )}
                      </>
                    ) : (
                      <p className="text-muted-foreground">
                        Último valor informado pela B3.
                      </p>
                    )}
                    {row.cdbEstimateStatus === "unavailable" && (
                      <p className="text-status-warning">
                        {row.cdbEstimateLimitation ??
                          "A estimativa com taxas CDI oficiais não está disponível."}
                      </p>
                    )}
                    {isDiCdb && (
                      <CdiRateIndicator percentage={row.cdiPercentage} />
                    )}
                    <p className="text-muted-foreground">
                      Último valor informado pela B3:{" "}
                      {formatCurrencyCents(row.reportedValueCents ?? null)}
                      {row.estimationBaseDate
                        ? ` · data-base CURVA de ${date.format(new Date(`${row.estimationBaseDate}T00:00:00Z`))}`
                        : ""}
                    </p>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      );
    },
  },
  {
    id: "actions",
    label: "Ações",
    width: "7%",
    className: "text-right",
    sortable: false,
    value: () => "",
    render: (row) => {
      const isDiCdb =
        /^CDB\b/i.test(row.product) && /^(DI|CDI)$/i.test(row.indexer ?? "");
      if (row.source !== "MANUAL" && !(isDiCdb && row.assetCode)) return null;

      return (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Ações para ${row.product}`}
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDiCdb && row.assetCode && (
                <DropdownMenuItem onSelect={() => onAdjustRate(row)}>
                  <Settings2 aria-hidden="true" />
                  Ajustar taxa
                </DropdownMenuItem>
              )}
              {row.source === "MANUAL" && isDiCdb && row.assetCode && (
                <DropdownMenuSeparator />
              )}
              {row.source === "MANUAL" && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      window.dispatchEvent(
                        new CustomEvent("portfolio:manual-position:edit", {
                          detail: { id: row.id },
                        }),
                      )
                    }
                  >
                    <Pencil aria-hidden="true" />
                    Editar posição
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-status-danger focus:text-status-danger"
                    onSelect={() =>
                      window.dispatchEvent(
                        new CustomEvent("portfolio:manual-position:remove", {
                          detail: { id: row.id },
                        }),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                    Excluir posição
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
    searchValue: (row) => formatDate(row.occurredAt),
    render: (row) => date.format(new Date(`${row.occurredAt}T00:00:00Z`)),
  },
  {
    id: "movementType",
    label: "Tipo",
    width: "17%",
    value: (row) => row.movementType,
    searchValue: (row) =>
      `${row.direction === "CREDITO" ? "Crédito" : "Débito"} ${row.movementType}`,
    render: (row) => {
      const isCredit = row.direction === "CREDITO";

      return (
        <Badge
          variant="outline"
          className={
            isCredit
              ? "border-primary/30 bg-primary/5 text-primary"
              : "border-status-danger/30 bg-status-danger/5 text-status-danger"
          }
        >
          {isCredit ? "Crédito" : "Débito"} · {row.movementType}
        </Badge>
      );
    },
  },
  {
    id: "product",
    label: "Produto / código",
    width: "22%",
    value: (row) => row.product,
    searchValue: (row) =>
      [row.product, row.assetCode].filter(Boolean).join(" "),
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
    searchValue: (row) => row.institution,
    render: (row) => row.institution ?? "—",
  },
  {
    id: "quantity",
    label: "Quantidade",
    width: "12%",
    className: "text-right",
    value: (row) => Number(row.quantity),
    searchValue: (row) => formatQuantity(Number(row.quantity)),
    render: (row) => formatQuantity(Number(row.quantity)),
  },
  {
    id: "unitPrice",
    label: "Preço unitário",
    width: "12%",
    className: "text-right",
    value: (row) => numberValue(row.unitPrice),
    searchValue: (row) =>
      row.unitPrice ? formatCurrency(Number(row.unitPrice)) : "",
    render: (row) =>
      row.unitPrice ? formatCurrency(Number(row.unitPrice)) : "—",
  },
  {
    id: "operationValue",
    label: "Valor",
    width: "11%",
    className: "text-right",
    value: (row) => numberValue(row.operationValue),
    searchValue: (row) =>
      row.operationValue ? formatCurrency(Number(row.operationValue)) : "",
    render: (row) =>
      row.operationValue ? formatCurrency(Number(row.operationValue)) : "—",
  },
];

export function PositionDetails({
  positions,
}: {
  positions: PortfolioPosition[];
}) {
  const [ratePosition, setRatePosition] = useState<PortfolioPosition | null>(
    null,
  );
  const [rateDialogKey, setRateDialogKey] = useState(0);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const rateAssetCodes = positions
    .filter(
      (position) =>
        position.assetCode &&
        /^CDB\b/i.test(position.product) &&
        /^(DI|CDI)$/i.test(position.indexer ?? ""),
    )
    .map((position) => position.assetCode!);

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Posições na carteira</CardTitle>
              <CardDescription className="mt-0.5">
                Valores, instituições e vencimentos registrados
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PortfolioTable
            columns={positionColumns((position) => {
              setRatePosition(position);
              setRateDialogKey((key) => key + 1);
              setRateDialogOpen(true);
            })}
            rows={positions}
            sourceFilter={{
              value: (row) =>
                row.source === "B3" || row.source === "MANUAL"
                  ? row.source
                  : null,
              options: [
                { value: "MANUAL", label: "Manual" },
                { value: "B3", label: "B3" },
              ],
            }}
            initialSort={{ id: "product", direction: "asc" }}
            emptyMessage="Importe um arquivo da B3 ou adicione uma posição manual."
            toolbarSummary={`${positions.length} ${positions.length === 1 ? "posição disponível" : "posições disponíveis"}`}
            toolbar={
              <>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    window.dispatchEvent(
                      new Event("portfolio:manual-position:create"),
                    )
                  }
                >
                  <Plus aria-hidden="true" className="mr-1.5 size-4" />
                  Adicionar posição
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Mais ações das posições"
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {rateAssetCodes.length > 0 && (
                      <>
                        <DropdownMenuItem
                          onSelect={() => {
                            setRatePosition(null);
                            setRateDialogKey((key) => key + 1);
                            setRateDialogOpen(true);
                          }}
                        >
                          <Settings2 aria-hidden="true" />
                          Ajustar taxas
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      className="text-status-danger focus:text-status-danger"
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 aria-hidden="true" />
                      Excluir posições importadas
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        </CardContent>
      </Card>
      <CdbRateConfiguration
        key={`${ratePosition ? `position:${ratePosition.id}` : "bulk"}:${rateDialogKey}`}
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        assetCode={ratePosition?.assetCode ?? undefined}
        currentPercentage={ratePosition?.cdiPercentage}
        assetCodes={ratePosition ? undefined : rateAssetCodes}
      />
      <DeleteImportedDataButton
        documentType="B3_POSITION_XLSX"
        label="posições importadas"
        hideTrigger
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
      <ManualPositionManager positions={positions} managementOnly />
    </div>
  );
}

export function MovementDetails({
  movements,
}: {
  movements: PortfolioMovement[];
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/10 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Movimentações</CardTitle>
            <CardDescription>Histórico registrado da carteira</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <PortfolioTable
            columns={movementColumns}
            rows={movements}
            initialSort={{ id: "occurredAt", direction: "desc" }}
            emptyMessage="Importe um arquivo de movimentações da B3 para visualizá-las."
            toolbarSummary={`${movements.length} ${movements.length === 1 ? "movimentação registrada" : "movimentações registradas"}`}
            toolbar={
              <>
                <Button
                  type="button"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    window.dispatchEvent(
                      new Event("portfolio:manual-operation:create"),
                    )
                  }
                >
                  <Plus aria-hidden="true" className="mr-1.5 size-4" />
                  Registrar operação
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Mais ações das movimentações"
                    >
                      <MoreHorizontal aria-hidden="true" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-status-danger focus:text-status-danger"
                      onSelect={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 aria-hidden="true" />
                      Excluir movimentações
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            }
          />
        </CardContent>
      </Card>
      <DeleteImportedDataButton
        documentType="B3_MOVEMENT_XLSX"
        label="movimentações"
        hideTrigger
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
      <ManualPortfolioOperations showTrigger={false} initiallyCollapsed />
    </div>
  );
}
