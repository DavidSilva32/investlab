// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/portfolio-table", () => ({
  PortfolioTable: ({
    columns,
    rows,
  }: {
    columns: Array<{
      id: string;
      render: (row: never) => unknown;
      value: (row: never) => unknown;
    }>;
    rows: never[];
  }) => (
    <div>
      {rows.flatMap((row) =>
        columns.map((column) => (
          <span key={column.id}>
            {String(column.value(row))}
            {column.render(row) as never}
          </span>
        )),
      )}
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
};

describe("portfolio detail components", () => {
  it("renders estimated and official values with their management action", () => {
    const html = renderToStaticMarkup(
      <PositionDetails positions={[position]} />,
    );
    expect(html).toContain("Posições atuais");
    expect(html).toContain("Estimativa provis");
    expect(html).toContain("100% do CDI");
    expect(html).toContain("arquivo de");
    expect(html).toContain("Estimativa provis");
    expect(html).toContain("18/09/2026");
    expect(html).toContain("Não foi possível confirmar o CDI oficial agora");
    expect(html).toContain("posições");
  });

  it("renders unconfigured and ordinary official values", () => {
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
    expect(html).toContain("110% do CDI");
    expect(html).toContain("Último valor informado pela B3");
    expect(html).toContain("atualizar a estimativa");
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
    expect(positions).toContain("Nenhuma posição importada");
    expect(movements).toContain("Crédito");
    expect(movements).toContain("Débito");
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
    expect(html).toContain("Estimativa provis");
    expect(html).not.toContain("% do CDI");
  });
  it("renders the empty movement state", () => {
    expect(renderToStaticMarkup(<MovementDetails movements={[]} />)).toContain(
      "Nenhuma movimentação importada",
    );
  });
});

it("shows the same-day estimate label when provisional data has no through date", () => {
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
  expect(html).toContain("Valor estimado hoje");
});
