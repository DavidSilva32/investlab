// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  onInteractOutside: null as
    | ((event: { target: EventTarget; preventDefault: () => void }) => void)
    | null,
}));

vi.mock("@/components/ui/popover", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/popover")>();
  return {
    ...actual,
    PopoverContent: (props: ComponentProps<typeof actual.PopoverContent>) => {
      captured.onInteractOutside =
        props.onInteractOutside as typeof captured.onInteractOutside;
      return createElement(actual.PopoverContent, props);
    },
  };
});

import { PortfolioTableFilterBuilder } from "@/components/portfolio-table-filter-builder";

describe("PortfolioTableFilterBuilder outside interaction", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    captured.onInteractOutside = null;
  });

  afterEach(cleanup);

  it("keeps the draft open when the outside target is a nested select", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioTableFilterBuilder
        columns={[{ id: "product", label: "Produto" }]}
        activeFilters={[]}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));

    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    const preventDefault = vi.fn();
    act(() => {
      captured.onInteractOutside?.({ target: listbox, preventDefault });
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("dialog", { name: "Filtros da tabela" }),
    ).toBeTruthy();
  });

  it("discards the draft when an outside target is not an HTML element", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioTableFilterBuilder
        columns={[{ id: "product", label: "Produto" }]}
        activeFilters={[]}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Filtros" }));

    act(() => {
      captured.onInteractOutside?.({
        target: new EventTarget(),
        preventDefault: vi.fn(),
      });
    });

    expect(
      screen.queryByRole("dialog", { name: "Filtros da tabela" }),
    ).toBeNull();
  });
});
