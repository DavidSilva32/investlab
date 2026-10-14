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

  it("keeps criteria in draft until apply, combines columns with AND, and resets pagination", async () => {
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
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Nome" }),
      "poupanca vanguard",
    );
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Valor" }),
      "500",
    );

    expect(screen.getByText("Mostrando 21–23 de 23")).toBeTruthy();
    expect(screen.getByText("23 registros")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("Poupança S&P 500 Vanguard ETF")).toBeTruthy();
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("Mostrando 1–10 de 23")).toBeTruthy();
  });

  it("searches formatted values instead of sort values and reports empty results", async () => {
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

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Data" }),
      "14/10/2026",
    );
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Quantidade" }),
      "1,5",
    );
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Valor" }),
      "inexistente",
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("Nenhum resultado encontrado.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Data" }),
      "14/10/2026",
    );
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Quantidade" }),
      "1,5",
    );
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Valor" }),
      "3.010,82",
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("R$ 3.010,82")).toBeTruthy();
    expect(screen.getByText("Mostrando 1–1 de 1")).toBeTruthy();
  });

  it("filters exact origin values and discards draft filters on cancel", async () => {
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
    type OriginRow = Row & { source: string };
    const rows: OriginRow[] = [
      { id: "1", name: "VOO", value: 100, source: "Manual" },
      { id: "2", name: "CDB", value: 200, source: "B3" },
      { id: "3", name: "Desconhecido", value: 300, source: "" },
    ];
    const originColumns: PortfolioTableColumn<OriginRow>[] = [
      ...columns,
      {
        id: "source",
        label: "Origem",
        width: "20%",
        value: (row) => row.source,
        searchValue: (row) => row.source,
        filterOptions: [
          { value: "Manual", label: "Manual" },
          { value: "B3", label: "B3" },
        ],
        render: (row) => row.source || "—",
      },
    ];
    render(
      <PortfolioTable
        columns={originColumns}
        rows={rows}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Origem" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Manual" }));
    expect(screen.getByText("3 registros")).toBeTruthy();
    expect(screen.getByText("Desconhecido")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("CDB")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Origem" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Manual" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("VOO")).toBeTruthy();
    expect(screen.queryByText("CDB")).toBeNull();
    expect(screen.queryByText("Desconhecido")).toBeNull();
    expect(screen.getByText("1 de 3 registros")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText("CDB")).toBeTruthy();
    expect(screen.getByText("Desconhecido")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Origem" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    expect(screen.queryByRole("option", { name: "Desconhecido" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "B3" }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(screen.getByText("CDB")).toBeTruthy();
    expect(screen.queryByText("VOO")).toBeNull();
    expect(screen.queryByText("Desconhecido")).toBeNull();
  });

  it("names each criterion control with its index", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioTable
        columns={columns}
        rows={[{ id: "1", name: "Alfa", value: 1 }]}
        initialSort={{ id: "name", direction: "asc" }}
        emptyMessage="Vazio"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    expect(screen.getByRole("combobox", { name: "Coluna 1" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Coluna 2" })).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Valor para Nome" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Valor para Valor" }),
    ).toBeTruthy();
  });
});
