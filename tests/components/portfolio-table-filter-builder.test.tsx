// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioTableFilterBuilder,
  type PortfolioTableFilter,
} from "@/components/portfolio-table-filter-builder";

const columns = [
  { id: "product", label: "Produto" },
  {
    id: "source",
    label: "Origem",
    options: [
      { value: "Manual", label: "Manual" },
      { value: "B3", label: "B3" },
    ],
  },
];

describe("PortfolioTableFilterBuilder", () => {
  beforeEach(() => {
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
  });
  afterEach(cleanup);

  it("keeps edits as a draft until explicit apply and refuses incomplete criteria", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={[]}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(
      screen.getByRole("dialog", { name: "Filtros da tabela" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filtrar" })).toHaveProperty(
      "disabled",
      true,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Produto" }),
      "voo",
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Filtrar" })).toHaveProperty(
      "disabled",
      false,
    );
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(onApply).toHaveBeenCalledWith([
      { columnId: "product", value: "voo" },
    ]);
  });

  it("supports exact option values and discards draft on cancel", async () => {
    const user = userEvent.setup();
    const activeFilters: PortfolioTableFilter[] = [];
    const onApply = vi.fn();
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={activeFilters}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Origem" }));
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Manual" }));
    expect(onApply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("shows active criteria and clears applied filters explicitly", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={[{ columnId: "source", value: "Manual" }]}
        onApply={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Filtros ativos" }).textContent,
    ).toContain("Origem: Manual");
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
