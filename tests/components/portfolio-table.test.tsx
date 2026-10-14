// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioTable,
  type PortfolioTableColumn,
} from "@/components/portfolio-table";

type Row = { id: string; name: string; value: number | null };
const bodyCellTexts = () =>
  Array.from(document.querySelectorAll("tbody td")).map(
    (cell) => cell.textContent,
  );
const columns: PortfolioTableColumn<Row>[] = [
  {
    id: "name",
    label: "Nome",
    width: "50%",
    value: (row) => row.name,
    render: (row) => row.name,
  },
  {
    id: "value",
    label: "Valor",
    width: "50%",
    className: "text-right",
    value: (row) => row.value,
    render: (row) => row.value ?? "—",
  },
];

describe("PortfolioTable", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses one fixed table layout and sorts a clicked column in both directions", async () => {
    render(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Zeta", value: 2 },
          { id: "2", name: "Alfa", value: 1 },
        ]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(document.querySelector("table")?.className).toContain("table-fixed");
    expect(screen.getByRole("button", { name: /Nome/ }).className).toContain(
      "cursor-pointer",
    );
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "2"]);
    await userEvent.click(screen.getByRole("button", { name: /Nome/ }));
    expect(bodyCellTexts()).toEqual(["Zeta", "2", "Alfa", "1"]);
    await userEvent.click(screen.getByRole("button", { name: /Valor/ }));
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "2"]);
  });

  it("returns an active descending sort to ascending", async () => {
    render(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Zeta", value: 2 },
          { id: "2", name: "Alfa", value: 1 },
        ]}
        initialSort={{ id: "value", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    const value = screen.getByRole("button", { name: /Valor/ });
    await userEvent.click(value);
    await userEvent.click(value);
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "2"]);
  });

  it("renders non-sortable columns as labels instead of sort buttons", () => {
    const columnsWithActions: PortfolioTableColumn<Row>[] = [
      ...columns,
      {
        id: "actions",
        label: "Ações",
        className: "text-right",
        width: "10%",
        sortable: false,
        value: () => null,
        render: () => "Editar",
      },
    ];

    render(
      <PortfolioTable
        columns={columnsWithActions}
        rows={[{ id: "1", name: "Alfa", value: 1 }]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Ações" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ações/ })).toBeNull();
    expect(screen.getByText("Editar")).toBeTruthy();
  });
  it("handles equal values and a null left comparison", () => {
    render(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Alfa", value: 1 },
          { id: "2", name: "Zeta", value: null },
          { id: "3", name: "Mesmo", value: 1 },
        ]}
        initialSort={{ id: "value", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Mesmo", "1", "Zeta", "—"]);
  });
  it("falls back to the first column when the initial key no longer exists", () => {
    render(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Zeta", value: 2 },
          { id: "2", name: "Alfa", value: 1 },
        ]}
        initialSort={{ id: "removed", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "2"]);
    expect(
      screen
        .getByRole("columnheader", { name: /Nome/ })
        .getAttribute("aria-sort"),
    ).toBe("ascending");
    expect(
      screen
        .getByRole("columnheader", { name: /Valor/ })
        .getAttribute("aria-sort"),
    ).toBeNull();
  });
  it("keeps null values at the end and renders the empty state", async () => {
    const { rerender } = render(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Zeta", value: null },
          { id: "2", name: "Alfa", value: 1 },
        ]}
        initialSort={{ id: "value", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "—"]);
    const valueHeader = screen.getByRole("columnheader", { name: /Valor/ });
    expect(valueHeader.getAttribute("aria-sort")).toBe("ascending");
    await userEvent.click(screen.getByRole("button", { name: /Valor/ }));
    expect(bodyCellTexts()).toEqual(["Alfa", "1", "Zeta", "—"]);
    expect(valueHeader.getAttribute("aria-sort")).toBe("descending");
    rerender(
      <PortfolioTable
        columns={columns}
        rows={[]}
        initialSort={{ id: "value", direction: "desc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(screen.getByText("Vazio")).toBeTruthy();
  });

  it("renders toolbar summary and action with rows and in the empty state", () => {
    const toolbar = <button type="button">Ação da tabela</button>;
    const { rerender } = render(
      <PortfolioTable
        columns={columns}
        rows={[{ id: "1", name: "Alfa", value: 1 }]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        toolbar={toolbar}
        toolbarSummary="1 posição disponível"
      />,
    );

    expect(screen.getByText("1 posição disponível")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ação da tabela" })).toBeTruthy();
    expect(document.querySelector("table")).toBeTruthy();

    rerender(
      <PortfolioTable
        columns={columns}
        rows={[]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        toolbar={toolbar}
        toolbarSummary="0 posições disponíveis"
      />,
    );

    expect(screen.getByText("0 posições disponíveis")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ação da tabela" })).toBeTruthy();
    expect(screen.getByText("Vazio")).toBeTruthy();
    expect(document.querySelector("table")).toBeNull();
  });

  it("uses default toolbar summaries for rows and an empty table", () => {
    const toolbar = <button type="button">Ação</button>;
    const { rerender } = render(
      <PortfolioTable
        columns={columns}
        rows={[{ id: "1", name: "Alfa", value: 1 }]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        toolbar={toolbar}
      />,
    );

    expect(screen.getByText("1 registro")).toBeTruthy();

    rerender(
      <PortfolioTable
        columns={columns}
        rows={[
          { id: "1", name: "Alfa", value: 1 },
          { id: "2", name: "Beta", value: 2 },
        ]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        toolbar={toolbar}
      />,
    );

    expect(screen.getByText("2 registros")).toBeTruthy();

    rerender(
      <PortfolioTable
        columns={columns}
        rows={[]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        toolbar={toolbar}
      />,
    );

    expect(screen.getByText("Nenhum registro")).toBeTruthy();
  });

  it("paginates long lists accessibly, resets after sorting, and adjusts after rows change", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 23 }, (_, index) => ({
      id: String(index),
      name: `Ativo ${String(index + 1).padStart(2, "0")}`,
      value: index,
    }));
    const { rerender } = render(
      <PortfolioTable
        columns={columns}
        rows={rows}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();
    expect(screen.getByText("Ativo 01")).toBeTruthy();
    expect(screen.queryByText("Ativo 11")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Mostrando 11–20 de 23")).toBeTruthy();
    expect(screen.getByText("Ativo 11")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));

    await user.click(screen.getByRole("button", { name: /Valor/ }));
    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(screen.getByText("Mostrando 21–23 de 23")).toBeTruthy();
    rerender(
      <PortfolioTable
        columns={columns}
        rows={rows.slice(0, 5)}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );
    expect(screen.getByText("Mostrando 1–5 de 5")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Próxima página" }),
    ).toHaveProperty("disabled", true);
  });

  it("searches across columns case and accent insensitively, resets pagination, and clears empty results", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 23 }, (_, index) => ({
      id: String(index),
      name:
        index === 22 ? "Poupança S&P 500 Vanguard ETF" : `Ativo ${index + 1}`,
      value: index === 22 ? 500 : index,
    }));
    render(
      <PortfolioTable
        columns={columns}
        rows={rows}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    const search = screen.getByRole("textbox", { name: "Pesquisar na tabela" });
    await user.type(search, "poupanca vanguard 500");

    expect(screen.getByText("Poupança S&P 500 Vanguard ETF")).toBeTruthy();
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();

    await user.type(search, "inexistente");
    expect(screen.getByText("Nenhum resultado encontrado.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();
  });

  it("searches formatted values instead of sort values", async () => {
    const user = userEvent.setup();
    type FormattedRow = {
      id: string;
      date: number;
      quantity: number;
      amount: number;
    };
    const formattedColumns: PortfolioTableColumn<FormattedRow>[] = [
      {
        id: "date",
        label: "Data",
        width: "33%",
        value: (row) => row.date,
        searchValue: () => "14/10/2026",
        render: () => "14/10/2026",
      },
      {
        id: "quantity",
        label: "Quantidade",
        width: "33%",
        value: (row) => row.quantity,
        searchValue: (row) => row.quantity.toLocaleString("pt-BR"),
        render: (row) => row.quantity.toLocaleString("pt-BR"),
      },
      {
        id: "amount",
        label: "Valor",
        width: "34%",
        value: (row) => row.amount,
        searchValue: () => "R$ 3.010,82",
        render: () => "R$ 3.010,82",
      },
    ];
    render(
      <PortfolioTable
        columns={formattedColumns}
        rows={[
          { id: "1", date: 1791936000000, quantity: 1.5, amount: 3010.82 },
        ]}
        initialSort={{ id: "date", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Pesquisar na tabela" }),
      "14/10/2026 1,5 3.010,82",
    );

    expect(screen.getByText("R$ 3.010,82")).toBeTruthy();
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeTruthy();
  });

  it("filters by an optional exact source without changing tables that do not configure it", async () => {
    const user = userEvent.setup();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: vi.fn(() => false),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    const rows = [
      { id: "1", name: "VOO", value: 100, source: "MANUAL" },
      { id: "2", name: "CDB", value: 200, source: "B3" },
      { id: "3", name: "Desconhecido", value: 300, source: null },
    ];
    render(
      <PortfolioTable
        columns={columns}
        rows={rows}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
        sourceFilter={{
          value: (row) => row.source,
          options: [
            { value: "MANUAL", label: "Manual" },
            { value: "B3", label: "B3" },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Filtrar por origem" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("combobox", { name: "Filtrar por origem" }),
    );
    await user.click(screen.getByRole("option", { name: "Manual" }));
    expect(screen.getByText("VOO")).toBeTruthy();
    expect(screen.queryByText("CDB")).toBeNull();
    expect(screen.getByText("1 de 3 registros")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("CDB")).toBeTruthy();
  });
});
