// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendAvailablePortfolioTableFilter,
  applyPortfolioTableFilterDraft,
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
    expect(
      screen.getByRole("dialog", { name: "Filtros da tabela" }),
    ).toBeTruthy();
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

  it("reopens active criteria, clears a value when its column changes, and removes criteria", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={[{ columnId: "product", value: "VOO" }]}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros 1" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Valor para Produto",
        }) as HTMLInputElement
      ).value,
    ).toBe("VOO");
    await user.click(screen.getByRole("combobox", { name: "Coluna 1" }));
    await user.click(screen.getByRole("option", { name: "Origem" }));
    expect(
      screen.getByRole("button", { name: "Filtrar" }).hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("combobox", { name: "Valor 1" }));
    await user.click(screen.getByRole("option", { name: "Manual" }));
    await user.click(
      screen.getByRole("button", { name: "Adicionar critério" }),
    );
    expect(
      screen.getByRole("combobox", { name: "Coluna 2" }).textContent,
    ).toContain("Produto");
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Produto" }),
      "VOO",
    );
    await user.click(
      screen.getByRole("button", { name: "Remover critério 2" }),
    );
    expect(screen.queryByRole("combobox", { name: "Coluna 2" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    expect(onApply).toHaveBeenCalledWith([
      { columnId: "source", value: "Manual" },
    ]);
  });

  it("discards drafts when the popover is dismissed from outside", async () => {
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
    await user.type(
      screen.getByRole("textbox", { name: "Valor para Produto" }),
      "VOO",
    );
    await user.click(document.body);

    expect(
      screen.queryByRole("dialog", { name: "Filtros da tabela" }),
    ).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps stale active filter values understandable when a column disappears", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={[{ columnId: "removed", value: "legacy" }]}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Filtros ativos" }).textContent,
    ).toContain("removed: legacy");
    await user.click(screen.getByRole("button", { name: "Filtros 1" }));
    expect(
      screen.getByRole("textbox", { name: "Valor para coluna" }),
    ).toBeTruthy();
  });

  it("uses the raw value when an active option no longer exists", () => {
    render(
      <PortfolioTableFilterBuilder
        columns={columns}
        activeFilters={[{ columnId: "source", value: "Importado" }]}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Filtros ativos" }).textContent,
    ).toContain("Origem: Importado");
  });

  it("keeps criteria unavailable when there are no filterable columns", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <PortfolioTableFilterBuilder
        columns={[]}
        activeFilters={[]}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    expect(
      screen.getByRole("textbox", { name: "Valor para coluna" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Filtrar" }).hasAttribute("disabled"),
    ).toBe(true);
    const addCriterionButton = Array.from(
      document.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Adicionar"));
    expect(addCriterionButton?.disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps the add guard when all filterable columns are already selected", async () => {
    const filters = [{ columnId: "product", value: "VOO" }];
    expect(appendAvailablePortfolioTableFilter(filters, [columns[0]])).toBe(
      filters,
    );
  });

  it("refuses to apply an incomplete filter draft even if called directly", () => {
    const onApply = vi.fn();
    const onApplied = vi.fn();
    expect(applyPortfolioTableFilterDraft([], onApply, onApplied)).toBe(false);
    expect(
      applyPortfolioTableFilterDraft(
        [{ columnId: "", value: "" }],
        onApply,
        onApplied,
      ),
    ).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });
});
