// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PortfolioClassificationList,
  type PortfolioPosition,
} from "@/app/portfolio/_components/portfolio-classification-list";

const positions: PortfolioPosition[] = [
  {
    id: "b8b74f5e-784e-4ef6-aa9e-3ad9b330ca1a",
    product: "CDB",
    institution: "Banco Exemplo",
    estimatedValue: 1000,
    totalValue: "900",
    classification: {
      assetClass: "Renda fixa",
      subClass: "CDB pós-fixado",
      geography: null,
    },
    classificationSource: "inferred",
  },
  {
    id: "a98bde34-1730-42ab-8c9c-97a88b52a7df",
    product: "Fundo Imobiliário",
    institution: "Corretora Exemplo",
    totalValue: "500",
    classification: {
      assetClass: "Fundos",
      subClass: "FII",
      geography: "Brasil",
    },
    classificationSource: "manual",
  },
  {
    id: "e05c0a4d-ace8-49ae-a670-74723a9ff983",
    product: "Produto sem valor",
    institution: null,
    estimatedValue: null,
    totalValue: null,
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified",
  },
];

const pointerMethods = [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView",
] as const;
const originals = new Map(
  pointerMethods.map((method) => [
    method,
    Object.getOwnPropertyDescriptor(Element.prototype, method),
  ]),
);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(Element.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => {},
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: () => {},
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const [method, descriptor] of originals) {
    if (descriptor)
      Object.defineProperty(Element.prototype, method, descriptor);
    else {
      delete (
        Element.prototype as Partial<
          Record<(typeof pointerMethods)[number], unknown>
        >
      )[method];
    }
  }
});

describe("PortfolioClassificationList", () => {
  it("limits the list, searches, selects visible items, and applies chosen fields in bulk", async () => {
    const onSaveBulk = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={positions}
        saving={false}
        onSave={vi.fn().mockResolvedValue(true)}
        onSaveBulk={onSaveBulk}
      />,
    );
    const disclosure = screen.getByRole("button", {
      name: /Mostrar.*classifica/i,
    });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    await user.click(disclosure);
    expect(
      screen
        .getByRole("button", { name: /Recolher.*classifica/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    const list = screen.getByRole("group", { name: "Lista de posições" });
    expect(list.className).toContain("max-h-[55vh]");
    expect(list.className).toContain("overflow-y-auto");
    expect(screen.getByText("Sem valor atual")).toBeTruthy();
    await user.type(
      screen.getByLabelText("Buscar por produto ou instituição"),
      "corretora",
    );
    expect(screen.getByText("Selecionar resultados (1)")).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    expect(screen.getByText("1 selecionado(s)")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Aplicar classe" }));
    expect(
      screen
        .getByRole("button", { name: "Aplicar aos selecionados" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("combobox", { name: "Classe em lote" }));
    await user.click(
      await screen.findByRole("option", { name: "Não informado" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar subclasse" }),
    );
    await user.type(screen.getByLabelText("Subclasse em lote"), "  FII  ");
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar geografia" }),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Geografia em lote" }),
    );
    await user.click(await screen.findByRole("option", { name: "Global" }));
    await user.click(
      screen.getByRole("button", { name: "Aplicar aos selecionados" }),
    );

    await waitFor(() => expect(onSaveBulk).toHaveBeenCalledOnce());
    expect(onSaveBulk).toHaveBeenCalledWith({
      positionIds: [positions[1].id],
      assetClass: null,
      subClass: "FII",
      geography: "Global",
    });
    expect(screen.getByText("0 selecionado(s)")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Aplicar aos selecionados" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("preserves hidden selections and allows clearing selected fields", async () => {
    const onSaveBulk = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={positions}
        saving={false}
        onSave={vi.fn().mockResolvedValue(false)}
        onSaveBulk={onSaveBulk}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Mostrar.*classifica/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    await user.type(
      screen.getByLabelText("Buscar por produto ou instituição"),
      "CDB",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    expect(screen.getByText("2 selecionado(s)")).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar subclasse" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar subclasse" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar subclasse" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar geografia" }),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Geografia em lote" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "Não informado" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Aplicar aos selecionados" }),
    );
    await waitFor(() => expect(onSaveBulk).toHaveBeenCalledOnce());
    expect(onSaveBulk).toHaveBeenCalledWith({
      positionIds: [positions[1].id, positions[2].id],
      subClass: null,
      geography: null,
    });
    expect(screen.getByText("2 selecionado(s)")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(screen.getByText("0 selecionado(s)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpar seleção" })).toBeNull();
  });

  it("shows an empty search state and disables selecting empty results", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={positions}
        saving={false}
        onSave={vi.fn().mockResolvedValue(true)}
        onSaveBulk={vi.fn().mockResolvedValue(true)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Mostrar.*classifica/i }),
    );
    await user.type(
      screen.getByLabelText("Buscar por produto ou instituição"),
      "inexistente",
    );
    expect(
      screen.getByText("Nenhuma posição corresponde à busca."),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("checkbox", { name: "Selecionar resultados visíveis" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("closes the individual editor on success and keeps it open after a failed save", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={[positions[0]]}
        saving={false}
        onSave={onSave}
        onSaveBulk={vi.fn().mockResolvedValue(true)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Mostrar.*classifica/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Editar classificação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar classificação" }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText("Subclasse")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Editar classificação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar classificação" }),
    );
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Subclasse")).toBeTruthy();
  });

  it("toggles an individual position without changing other selections", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={positions}
        saving={false}
        onSave={vi.fn().mockResolvedValue(true)}
        onSaveBulk={vi.fn().mockResolvedValue(true)}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Mostrar.*classifica/i }),
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Selecionar posição CDB",
    });
    await user.click(checkbox);
    expect(screen.getByText("1 selecionado(s)")).toBeTruthy();
    await user.click(checkbox);
    expect(screen.getByText("0 selecionado(s)")).toBeTruthy();
  });

  it("applies a selected class without changing geography", async () => {
    const onSaveBulk = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <PortfolioClassificationList
        positions={positions}
        saving={false}
        onSave={vi.fn().mockResolvedValue(true)}
        onSaveBulk={onSaveBulk}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Mostrar.*classifica/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Aplicar classe" }));
    await user.click(screen.getByRole("combobox", { name: "Classe em lote" }));
    await user.click(
      await screen.findByRole("option", { name: "Renda variável" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Aplicar aos selecionados" }),
    );
    await waitFor(() => expect(onSaveBulk).toHaveBeenCalledOnce());
    expect(onSaveBulk).toHaveBeenCalledWith({
      positionIds: positions.map((position) => position.id),
      assetClass: "Renda variável",
    });
  });
});
