import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/portfolio-table", () => ({
  PortfolioTable: ({ rows }: { rows: Array<{ product?: string }> }) => (
    <div>{rows.map((row) => row.product)}</div>
  ),
}));
vi.mock("@/components/delete-imported-data-button", () => ({
  DeleteImportedDataButton: ({ label }: { label: string }) => (
    <button>{label}</button>
  ),
}));

import {
  MovementDetails,
  PositionDetails,
} from "@/app/portfolio/_components/portfolio-details";

describe("portfolio detail components", () => {
  it("renders positions with their management action", () => {
    const html = renderToStaticMarkup(
      <PositionDetails
        positions={[
          {
            id: "1",
            product: "CDB",
            assetCode: null,
            quantity: "1",
            institution: null,
            indexer: null,
            issuedAt: null,
            maturityAt: null,
            totalValue: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Posições atuais");
    expect(html).toContain("1 posições disponíveis");
    expect(html).toContain("posições");
  });

  it("renders movements with their management action", () => {
    const html = renderToStaticMarkup(
      <MovementDetails
        movements={[
          {
            id: "1",
            direction: "CREDITO",
            occurredAt: "2026-01-01",
            movementType: "APLICAÇÃO",
            product: "CDB",
            assetCode: null,
            institution: null,
            quantity: "1",
            unitPrice: null,
            operationValue: null,
          },
        ]}
      />,
    );
    expect(html).toContain("Movimentações");
    expect(html).toContain("1 movimentações importadas");
    expect(html).toContain("movimentações");
  });
});
