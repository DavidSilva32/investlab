// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/portfolio-table", () => ({
  PortfolioTable: ({
    columns,
    rows,
    toolbar,
    toolbarSummary,
    emptyMessage,
  }: {
    columns: Array<{
      id: string;
      render: (row: never) => unknown;
      value: (row: never) => unknown;
    }>;
    rows: never[];
    toolbar?: ReactNode;
    toolbarSummary?: string;
    emptyMessage: string;
  }) => (
    <div>
      {toolbar ? (
        <div data-testid="table-toolbar">
          <span>{toolbarSummary}</span>
          {toolbar}
        </div>
      ) : null}
      {rows.flatMap((row) =>
        columns.map((column) => (
          <span key={column.id}>
            {String(column.value(row))}
            {column.render(row) as never}
          </span>
        )),
      )}
      {rows.length === 0 ? <p>{emptyMessage}</p> : null}
    </div>
  ),
}));
vi.mock("@/components/delete-imported-data-button", () => ({
  DeleteImportedDataButton: ({ label }: { label: string }) => (
    <button>{label}</button>
  ),
}));
vi.mock("@/app/portfolio/_components/cdb-rate-configuration", () => ({
  CdbRateConfiguration: () => <span>Configurar taxa</span>,
}));

import {
  MovementDetails,
  PositionDetails,
} from "@/app/portfolio/_components/portfolio-details";

const position = {
  id: "1",
  product: "CDB",
  assetCode: "CDB1",
  quantity: "1",
  institution: "Banco",
  indexer: "DI",
  issuedAt: "2026-01-01",
  maturityAt: "2027-01-01",
  totalValue: "1000",
  estimationBaseDate: "2026-09-16",
  cdiPercentage: "100",
  estimatedValue: 1000.55,
  cdbEstimateStatus: "provisional" as const,
  estimatedThrough: "2026-09-18",
  cdbProjectedFromDate: "2026-09-19",
  cdbProjectedThroughDate: "2026-09-21",
  cdbEstimateLimitation: "Estimativa parcial: ainda não há taxa CDI oficial.",
};

describe("portfolio detail components", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("puts manual entry, rate adjustment and imported deletion in the positions table toolbar", () => {
    const dispatchSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => true);
    render(<PositionDetails positions={[position]} />);

    const button = screen.getByRole("button", {
      name: "Adicionar posição",
    });
    expect(screen.getByTestId("table-toolbar").contains(button)).toBe(true);
    expect(screen.getByTestId("table-toolbar").textContent).toContain(
      "1 posição disponível",
    );
    expect(screen.getAllByText("Configurar taxa")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "posições importadas" }),
    ).toBeTruthy();
    fireEvent.click(button);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-position:create" }),
    );
  });

  it("shows the saved CDI percentage as an informational manual-position fact", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          {
            ...position,
            id: "manual-cdb",
            source: "MANUAL",
            informationalCdiPercentage: "112.5000",
          },
        ]}
      />,
    );

    expect(html).toContain(
      "Premissa informativa: 112.5% do CDI. Não usada para calcular rendimento.",
    );
  });

  it("uses the exact asset code for position identity without inferring tickers from product names", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          {
            ...position,
            id: "stock",
            product: "Petrobras",
            assetCode: "PETR4",
          },
          {
            ...position,
            id: "manual",
            source: "MANUAL",
            product: "ETF internacional",
            assetCode: "VOO",
          },
          { ...position, id: "unknown", product: "Petrobras", assetCode: null },
        ]}
      />,
    );
    expect(html).toContain('aria-label="Identidade de Petrobras"');
    expect(html).toContain('aria-label="Identidade de ETF internacional"');
    expect(html).toContain('src="https://icons.brapi.dev/icons/PETR4.svg"');
    expect(html).not.toContain("icons/VOO.svg");
    expect(html).not.toContain("icons/PETR3.svg");
  });
  it("renders estimated and official values with their management action", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          position,
          {
            ...position,
            id: "complete",
            cdbEstimateStatus: "complete",
            cdbProjectedFromDate: null,
            cdbProjectedThroughDate: null,
            cdbEstimateLimitation: null,
          },
        ]}
      />,
    );
    expect(html).not.toContain("Posições atuais");
    expect(html).toContain("Adicionar posição");
    expect(html).not.toContain("Posições manuais");
    expect(html).toContain("Estimativa parcial até");
    expect(html).toContain("Estimativa até");
    expect(html).toContain("100% do CDI");
    expect(html).toContain("data-base CURVA de");
    expect(html).toContain("Trecho projetado: de 19/09/2026 a 21/09/2026");
    expect(html).toContain("18/09/2026");
    expect(html).toContain("Estimativa parcial: ainda não há taxa CDI oficial");
    expect(html).toContain("posições");
  });

  it("renders the frontend limitation fallback and ordinary official values", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          {
            ...position,
            assetCode: "CDB2",
            estimatedValue: null,
            cdiPercentage: "110",
            estimationBaseDate: null,
            cdbEstimateStatus: "unavailable",
            cdbEstimateLimitation: undefined,
          },
          {
            ...position,
            product: "Tesouro",
            assetCode: null,
            indexer: null,
            institution: null,
            issuedAt: null,
            maturityAt: null,
            totalValue: "10",
            estimatedValue: null,
          },
          { ...position, totalValue: null, estimatedValue: null },
          { ...position, estimatedValue: 1001, estimationBaseDate: null },
          {
            ...position,
            indexer: "IPCA",
            estimatedValue: null,
            cdiPercentage: null,
          },
          {
            ...position,
            assetCode: null,
            indexer: null,
            estimatedValue: null,
            cdiPercentage: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Configurar taxa");
    expect(html).toContain(
      "A estimativa com taxas CDI oficiais não está disponível.",
    );
    expect(html).toContain("110% do CDI");
    expect(html).toContain("Último valor informado pela B3");
    expect(html).toContain("estimativa com taxas CDI oficiais");
    expect(html).not.toContain("Nenhuma posição importada");
  });

  it("renders empty positions and movement value variants", () => {
    const positions = renderToStaticMarkup(<PositionDetails positions={[]} />);
    const movements = renderToStaticMarkup(
      <MovementDetails
        movements={[
          {
            id: "1",
            direction: "CREDITO",
            occurredAt: "2026-01-01",
            movementType: "APLICAÇÃO",
            product: "CDB",
            assetCode: "CDB1",
            institution: "Banco",
            quantity: "1",
            unitPrice: "10",
            operationValue: "10",
          },
          {
            id: "2",
            direction: "DEBITO",
            occurredAt: "2026-01-02",
            movementType: "RESGATE",
            product: "CDB",
            assetCode: null,
            institution: null,
            quantity: "2",
            unitPrice: null,
            operationValue: null,
          },
        ]}
      />,
    );
    expect(positions).toContain("0 posições disponíveis");
    expect(positions).toContain("Importe um arquivo da B3");
    expect(movements).toContain("Crédito");
    expect(movements).toContain("Débito");
    expect(movements).toContain("2 movimentações registradas");
    expect(movements).toContain("Registrar operação");
    expect(movements).toContain("Registros manuais e conciliação");
  });
  it("formats missing CDI percentages and ignores CDBs without an indexer", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          { ...position, estimatedValue: 1001, cdiPercentage: null },
          { ...position, estimatedValue: 1002, cdiPercentage: undefined },
          {
            ...position,
            assetCode: "CDB3",
            indexer: null,
            estimatedValue: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Estimativa parcial até");
    expect(html).not.toContain("% do CDI");
  });
  it("renders the empty movement state", () => {
    expect(renderToStaticMarkup(<MovementDetails movements={[]} />)).toContain(
      "Importe um arquivo de movimentações da B3 para visualizá-las.",
    );
  });

  it("keeps registering movements inside the movements table toolbar", () => {
    const dispatchSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => true);
    render(<MovementDetails movements={[]} />);

    const button = screen.getByRole("button", { name: "Registrar operação" });
    expect(screen.getByTestId("table-toolbar").contains(button)).toBe(true);
    expect(screen.getByTestId("table-toolbar").textContent).toContain(
      "0 movimentações registradas",
    );
    fireEvent.click(button);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:manual-operation:create" }),
    );
  });

  it("uses the singular count for one movement", () => {
    const html = renderToStaticMarkup(
      <MovementDetails
        movements={[
          {
            id: "single",
            direction: "CREDITO",
            occurredAt: "2026-01-01",
            movementType: "APLICAÇÃO",
            product: "CDB",
            assetCode: "CDB1",
            institution: "Banco",
            quantity: "1",
            unitPrice: "10",
            operationValue: "10",
          },
        ]}
      />,
    );

    expect(html).toContain("1 movimentação registrada");
    expect(html).not.toContain("1 movimentações registradas");
  });
});

it("does not claim a current valuation when no covered-through date is returned", () => {
  const html = renderToStaticMarkup(
    <PositionDetails
      positions={[
        {
          ...position,
          estimatedValue: 1001,
          cdbEstimateStatus: "provisional",
          estimatedThrough: null,
        },
      ]}
    />,
  );
  expect(html).toContain("Valor estimado");
  expect(html).not.toContain("Valor estimado hoje");
});

it("shows the manual valuation source, dates, and missing BRL conversion", () => {
  const html = renderToStaticMarkup(
    <PositionDetails
      positions={[
        {
          ...position,
          id: "manual-brl",
          source: "MANUAL",
          currency: "BRL",
          totalValue: "500",
          reportedTotalValue: "500",
          valueBasis: "total_value",
          positionDate: "2026-09-20",
          convertedValueBrl: null,
          conversionDate: null,
        },
        {
          ...position,
          id: "manual-usd-converted",
          source: "MANUAL",
          currency: "USD",
          totalValue: "120",
          reportedTotalValue: "100",
          positionDate: undefined,
          convertedValueBrl: "120",
          conversionDate: "2026-09-19",
        },
        {
          ...position,
          id: "manual-no-currency",
          source: "MANUAL",
          currency: undefined,
          totalValue: "50",
          reportedTotalValue: "50",
          positionDate: undefined,
          convertedValueBrl: "50",
          conversionDate: "2026-09-19",
        },
        {
          ...position,
          id: "manual-usd-unconverted",
          source: "MANUAL",
          currency: "USD",
          totalValue: null,
          reportedTotalValue: null,
          positionDate: undefined,
          convertedValueBrl: null,
          conversionDate: null,
        },
      ]}
    />,
  );
  expect(html).toContain("Manual");
  expect(html).toContain("Informado manualmente");
  expect(html).toContain("Valor observado em");
  expect(html).toContain("Conversão informada em");
  expect(html).toContain("100 USD");
  expect(html).toContain("Sem conversão para reais");
});
