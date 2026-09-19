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
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Zeta", "2"],
    );
    await userEvent.click(screen.getByRole("button", { name: /Nome/ }));
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Zeta", "2", "Alfa", "1"],
    );
    await userEvent.click(screen.getByRole("button", { name: /Valor/ }));
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Zeta", "2"],
    );
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
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Zeta", "2"],
    );
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
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Mesmo", "1", "Zeta", "—"],
    );
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
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Zeta", "2"],
    );
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
    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Alfa", "1", "Zeta", "—"],
    );
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
});
