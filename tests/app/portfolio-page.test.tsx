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

describe("PortfolioPage", () => {
  it("renders positions with user-facing labels and available dates", async () => {
    listPositions.mockResolvedValue([
      {
        id: "1",
        product: "CDB",
        assetCode: "CDB1",
        quantity: "2",
        institution: null,
        issuedAt: "2026-01-01",
        maturityAt: "2030-12-31",
        totalValue: "100",
      },
      {
        id: "2",
        product: "Tesouro",
        assetCode: null,
        quantity: "1",
        institution: "B3",
        issuedAt: null,
        maturityAt: null,
        totalValue: null,
      },
    ]);
    listMovements.mockResolvedValue([]);
    const html = renderToStaticMarkup(await PortfolioPage());
    expect(html).toContain("Posições atuais");
    expect(html).toContain("01/01/2026");
    expect(html).toContain("31/12/2030");
    expect(html).toContain("Tesouro");
    expect(html).not.toContain("Snapshot atual");
  });

  it("renders empty states for both portfolio views", async () => {
    listPositions.mockResolvedValue([]);
    listMovements.mockResolvedValue([]);
    expect(renderToStaticMarkup(await PortfolioPage())).toContain(
      "Nenhuma posição importada",
    );
    expect(
      renderToStaticMarkup(
        await PortfolioPage({
          searchParams: Promise.resolve({ view: "movements" }),
        }),
      ),
    ).toContain("Nenhuma movimentação importada");
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
  });
});
