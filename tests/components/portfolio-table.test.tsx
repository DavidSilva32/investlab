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
});
