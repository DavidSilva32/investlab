import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const listPositions = vi.hoisted(() => vi.fn());
const listMovements = vi.hoisted(() => vi.fn());
vi.mock("@/backend/repositories/import.repository", () => ({
  importRepository: { listLatestPositions: listPositions, listMovements },
}));
vi.mock("@/components/portfolio-table", () => ({
  PortfolioTable: ({
    columns,
    rows,
  }: {
    columns: Array<{
      value: (row: never) => unknown;
      render: (row: never) => unknown;
    }>;
    rows: never[];
  }) => (
    <div>
      {rows.flatMap((row) =>
        columns.map((column) => {
          column.value(row);
          return column.render(row);
        }),
      )}
    </div>
  ),
}));
vi.mock("@/components/delete-imported-data-button", () => ({
  DeleteImportedDataButton: ({ label }: { label: string }) => (
    <button>Excluir {label}</button>
  ),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import PortfolioPage from "@/app/portfolio/page";

const position = {
  id: "1",
  product: "CDB",
  assetCode: "CDB1",
  quantity: "2",
  institution: null,
  indexer: "100% CDI",
  issuedAt: "2026-01-01",
  maturityAt: "2030-12-31",
  totalValue: "100",
};

describe("PortfolioPage", () => {
  it("renders an actionable overview from the latest positions", async () => {
    listPositions.mockResolvedValue([
      position,
      {
        ...position,
        id: "2",
        product: "Tesouro",
        assetCode: null,
        institution: "B3",
        indexer: null,
        issuedAt: null,
        maturityAt: null,
        totalValue: null,
      },
      {
        ...position,
        id: "3",
        product: "Título sem valor",
        maturityAt: "2031-01-01",
        totalValue: null,
      },
    ]);
    listMovements.mockResolvedValue([]);

    const html = renderToStaticMarkup(await PortfolioPage());

    expect(html).toContain("Patrimônio atual");
    expect(html).toContain("Como seu patrimônio está distribuído");
    expect(html).toContain("Instituição não informada");
    expect(html).toContain("31/12/2030");
    expect(html).toContain("Concentração relevante");
    expect(html).toContain("Valor não informado");
    expect(html).toContain("Próximos vencimentos");
    expect(html).toContain('href="/portfolio?view=positions"');
  });

  it("renders diversification in the overview when values are split", async () => {
    listPositions.mockResolvedValue([
      { ...position, institution: "Banco A", totalValue: "400" },
      {
        ...position,
        id: "2",
        product: "LCI",
        institution: "Banco B",
        maturityAt: "2031-01-01",
        totalValue: "350",
      },
      {
        ...position,
        id: "3",
        product: "Tesouro",
        institution: "Banco C",
        maturityAt: null,
        totalValue: "250",
      },
    ]);
    listMovements.mockResolvedValue([]);

    const html = renderToStaticMarkup(await PortfolioPage());

    expect(html).toContain("Maior exposição");
    expect(html).toContain("Diversificação institucional");
    expect(html).toContain("Banco A");
    expect(html).toContain("Banco B");
  });

  it("renders empty states in the overview and detail views", async () => {
    listPositions.mockResolvedValue([]);
    listMovements.mockResolvedValue([]);

    expect(renderToStaticMarkup(await PortfolioPage())).toContain(
      "Ainda não há valores atuais para mostrar a alocação.",
    );
    expect(
      renderToStaticMarkup(
        await PortfolioPage({
          searchParams: Promise.resolve({ view: "positions" }),
        }),
      ),
    ).toContain("Nenhuma posição importada");
    expect(
      renderToStaticMarkup(
        await PortfolioPage({
          searchParams: Promise.resolve({ view: "movements" }),
        }),
      ),
    ).toContain("Nenhuma movimentação importada");
  });

  it("renders position details and optional fields", async () => {
    listPositions.mockResolvedValue([
      position,
      {
        ...position,
        id: "2",
        product: "Sem dados",
        assetCode: null,
        institution: null,
        indexer: null,
        issuedAt: null,
        maturityAt: null,
        totalValue: null,
      },
    ]);
    listMovements.mockResolvedValue([]);

    const html = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "positions" }),
      }),
    );

    expect(html).toContain("Posições atuais");
    expect(html).toContain("100% CDI");
    expect(html).toContain("01/01/2026");
    expect(html).toContain("Excluir posições");
    expect(html).toContain("R$ 100,00");
  });

  it("renders movement fields whether optional values exist or not", async () => {
    listPositions.mockResolvedValue([]);
    listMovements.mockResolvedValue([
      {
        id: "m1",
        direction: "CREDITO",
        occurredAt: "2026-09-11",
        movementType: "APLICAÇÃO",
        product: "CDB - CDB4265W9HJ",
        assetCode: "CDB4265W9HJ",
        institution: "BANCO INTER S/A",
        quantity: "20000",
        unitPrice: "0.01",
        operationValue: "200",
      },
      {
        id: "m2",
        direction: "DEBITO",
        occurredAt: "2026-09-12",
        movementType: "RESGATE",
        product: "Produto",
        assetCode: null,
        institution: null,
        quantity: "1",
        unitPrice: null,
        operationValue: null,
      },
    ]);
    const html = renderToStaticMarkup(
      await PortfolioPage({
        searchParams: Promise.resolve({ view: "movements" }),
      }),
    );
    expect(html).toContain("Movimentações");
    expect(html).toContain("Crédito");
    expect(html).toContain("Débito");
    expect(html).toContain("CDB4265W9HJ");
    expect(html).toContain("R$ 200,00");
    expect(html).toContain("Excluir movimentações");
  });
});
