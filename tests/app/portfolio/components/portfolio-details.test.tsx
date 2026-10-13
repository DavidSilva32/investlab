// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  DeleteImportedDataButton: ({
    label,
    hideTrigger,
    open,
  }: {
    label: string;
    hideTrigger?: boolean;
    open?: boolean;
  }) =>
    hideTrigger ? (
      open ? (
        <div role="alertdialog">Excluir {label}</div>
      ) : null
    ) : (
      <button>{label}</button>
    ),
}));
vi.mock("@/app/portfolio/_components/cdb-rate-configuration", () => ({
  CdbRateConfiguration: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Configurar taxa</div> : null,
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

  it("puts manual entry and bulk actions in the positions table toolbar", async () => {
    const user = userEvent.setup();
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
    expect(screen.queryByText("Configurar taxa")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Mais a/ }));
    await user.click(screen.getByText("Ajustar taxas"));
    expect(screen.getByRole("dialog").textContent).toContain("Configurar taxa");
    fireEvent.keyDown(document, { key: "Escape" });

    await user.click(screen.getByRole("button", { name: /Mais a/ }));
    await user.click(screen.getByText(/Excluir posi/));
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Excluir posições importadas",
    );
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

  it("exposes rate, edit, and remove actions for a manual CDB row", async () => {
    const user = userEvent.setup();
    const eventSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => true);
    render(
      <PositionDetails
        positions={[{ ...position, id: "manual-cdb", source: "MANUAL" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /para CDB/ }));
    await user.click(screen.getByText("Ajustar taxa"));
    expect(screen.getByRole("dialog").textContent).toContain("Configurar taxa");
    fireEvent.keyDown(document, { key: "Escape" });

    await user.click(screen.getByRole("button", { name: /para CDB/ }));
    await user.click(screen.getByText(/Editar posi/));
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "portfolio:manual-position:edit",
      }),
    );

    await user.click(screen.getByRole("button", { name: /para CDB/ }));
    await user.click(screen.getByText(/Excluir posi/));
    expect(eventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "portfolio:manual-position:remove",
      }),
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
  it("shows estimated and official value details on demand", () => {
    render(
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
    const detailsButtons = screen.getAllByRole("button", {
      name: "Consultar origem e estimativa de CDB",
    });
    fireEvent.click(detailsButtons[0]);
    expect(
      screen.getByText(/Estimativa parcial at.{1,2} 18\/09\/2026/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Trecho projetado: de 19\/09\/2026 a 21\/09\/2026/),
    ).toBeTruthy();
    expect(screen.getByText(/18\/09\/2026/)).toBeTruthy();
    expect(screen.getByText(/Estimativa parcial: ainda/)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(detailsButtons[1]);
    expect(screen.getByText(/Estimativa at/)).toBeTruthy();
    expect(screen.getByText(/100% do CDI/)).toBeTruthy();
    expect(screen.getByText(/data-base CURVA de/)).toBeTruthy();
  });

  it("shows the frontend limitation fallback and ordinary official values on demand", () => {
    render(
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
    expect(screen.queryByText("Configurar taxa")).toBeNull();
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Consultar origem e estimativa de CDB",
      })[0],
    );
    expect(
      screen.getByText(/A estimativa com taxas CDI oficiais/),
    ).toBeTruthy();
    expect(screen.getByText(/110% do CDI/)).toBeTruthy();
    expect(
      screen.getAllByText(/valor informado pela B3/i).length,
    ).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Consultar origem e estimativa de Tesouro",
      }),
    );
    expect(
      screen.getAllByText(/valor informado pela B3/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Nenhuma posi/)).toBeNull();
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
    render(
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
    const detailsButtons = screen.getAllByRole("button", {
      name: "Consultar origem e estimativa de CDB",
    });
    fireEvent.click(detailsButtons[0]);
    expect(
      screen.getByText(/Estimativa parcial at.{1,2} 18\/09\/2026/),
    ).toBeTruthy();
    expect(screen.queryByText(/% do CDI/)).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(detailsButtons[2]);
    expect(screen.queryByText(/% do CDI/)).toBeNull();
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

  it("opens the movement deletion confirmation from the table actions menu", async () => {
    const user = userEvent.setup();
    render(<MovementDetails movements={[]} />);

    await user.click(screen.getByRole("button", { name: /Mais a/ }));
    await user.click(screen.getByText(/Excluir moviment/));

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Excluir movimentações",
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
  render(
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
  fireEvent.click(
    screen.getByRole("button", {
      name: "Consultar origem e estimativa de CDB",
    }),
  );
  expect(screen.getByText("Valor estimado.")).toBeTruthy();
  expect(screen.queryByText("Valor estimado hoje")).toBeNull();
});

it("shows the manual valuation source, dates, and missing BRL conversion", () => {
  render(
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
  const detailsButtons = screen.getAllByRole("button", {
    name: "Consultar origem e estimativa de CDB",
  });
  fireEvent.click(detailsButtons[0]);
  expect(screen.getByText(/Valor informado manualmente/)).toBeTruthy();
  expect(screen.getByText(/Valor observado em/)).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(detailsButtons[1]);
  expect(screen.getByText(/100 USD informado manualmente/)).toBeTruthy();
  expect(screen.getByText(/Convers/)).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(detailsButtons[3]);
  expect(screen.getByText(/Sem convers/)).toBeTruthy();
});
