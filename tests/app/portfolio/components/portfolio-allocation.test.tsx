// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { PortfolioAllocation } from "@/app/portfolio/_components/portfolio-allocation";

const pointerCaptureMethods = [
  "hasPointerCapture",
  "setPointerCapture",
  "releasePointerCapture",
  "scrollIntoView",
] as const;
const originalPointerCaptureMethods = new Map(
  pointerCaptureMethods.map((method) => [
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

const positions = [
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
    product: "CDB adicional",
    institution: "Banco Exemplo",
    totalValue: "300",
    classification: {
      assetClass: "Renda fixa",
      subClass: "CDB pós-fixado",
      geography: null,
    },
    classificationSource: "inferred",
  },
  {
    id: "caa441ed-36f4-4c66-ade6-a9152c17bdab",
    product: "Produto sem valor",
    institution: null,
    estimatedValue: null,
    totalValue: null,
    classification: { assetClass: null, subClass: null, geography: null },
    classificationSource: "unclassified",
  },
];

const response = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

describe("PortfolioAllocation", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const [method, descriptor] of originalPointerCaptureMethods) {
      if (descriptor)
        Object.defineProperty(Element.prototype, method, descriptor);
      else
        delete (
          Element.prototype as Partial<
            Record<(typeof pointerCaptureMethods)[number], unknown>
          >
        )[method];
    }
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("shows current values by class, subclass, and geography", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ positions })));
    const user = userEvent.setup();
    render(<PortfolioAllocation />);

    expect(screen.getByRole("status").textContent).toContain("Carregando");
    expect(
      await screen.findByText(/Patrimônio com valor informado/),
    ).toBeTruthy();
    await user.click(
      await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
    );
    expect(
      screen.getByRole("progressbar", { name: "Renda fixa: 72.2%" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Fundos: 27.8%" }),
    ).toBeTruthy();
    expect(screen.getAllByText(/CDB pós-fixado/)[0]).toBeTruthy();
    expect(screen.getByText(/ajuste manual/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Subclasse" }));
    expect(
      screen.getByRole("progressbar", { name: "CDB pós-fixado: 72.2%" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Geografia" }));
    expect(
      screen.getByRole("progressbar", { name: "Não informado: 72.2%" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "Brasil: 27.8%" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Classe" }));
    await user.click(
      screen.getAllByRole("button", { name: "Editar classificação" })[0],
    );
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByLabelText("Subclasse")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Renda fixa: 72.2%" }),
    ).toBeTruthy();
  });

  it("places valued but unclassified positions in the unknown allocation", async () => {
    const unclassified = { ...positions[3], totalValue: "250" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ positions: [unclassified] })),
    );
    render(<PortfolioAllocation />);
    expect(
      await screen.findByRole("progressbar", { name: "Não informado: 100.0%" }),
    ).toBeTruthy();
  });

  it("explains when positions have no current values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ positions: [positions[3]] })),
    );
    render(<PortfolioAllocation />);
    expect(
      await screen.findByText(
        "Não há valores atuais para calcular a distribuição.",
      ),
    ).toBeTruthy();
  });
  it("handles zero and invalid position values without dividing by zero", async () => {
    const zero = { ...positions[3], totalValue: "0" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ positions: [zero] })),
    );
    render(<PortfolioAllocation />);
    expect(
      await screen.findByRole("progressbar", { name: "Não informado: 0.0%" }),
    ).toBeTruthy();
  });

  it("falls back to the imported value when the estimate is invalid", async () => {
    const position = {
      ...positions[3],
      estimatedValue: Number.NaN,
      totalValue: "700",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ positions: [position] })),
    );
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    expect(await screen.findByRole("progressbar")).toBeTruthy();
    expect(screen.getAllByText(/700,00/)).toHaveLength(3);
  });

  it("treats invalid imported values as unavailable", async () => {
    const invalid = {
      ...positions[3],
      estimatedValue: Number.NaN,
      totalValue: "invalid",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          positions: [
            invalid,
            {
              ...positions[3],
              id: "f67b4ad9-b053-422f-bb05-22f7a9fdb8e8",
              totalValue: "invalid",
            },
          ],
        }),
      ),
    );
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );
    expect(await screen.findAllByText("Sem valor atual")).toHaveLength(2);
    expect(
      screen.getByText("Não há valores atuais para calcular a distribuição."),
    ).toBeTruthy();
  });
  it("reloads when another portfolio import is confirmed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ positions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PortfolioAllocation />);
    await screen.findByText(
      "Importe posições para visualizar a classificação e a alocação.",
    );

    window.dispatchEvent(new Event("portfolio:updated"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  it("shows an empty portfolio state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ positions: [] })),
    );
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    expect(
      await screen.findByText(
        "Importe posições para visualizar a classificação e a alocação.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Definir metas" }));
    expect(screen.getByRole("button", { name: "Salvar metas" })).toBeTruthy();
  });

  it("shows a load error and allows retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "failed" }, false))
      .mockResolvedValueOnce(response({ positions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await user.click(
      await screen.findByRole("button", { name: "Tentar novamente" }),
    );
    expect(
      await screen.findByText(
        "Importe posições para visualizar a classificação e a alocação.",
      ),
    ).toBeTruthy();
  });

  it("saves a manual classification and reloads the current positions", async () => {
    const savedPositions = [
      {
        ...positions[0],
        classification: { ...positions[0].classification, geography: "Brasil" },
        classificationSource: "manual",
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [positions[0]] }))
      .mockResolvedValueOnce(response({ message: "Classificação salva." }))
      .mockResolvedValueOnce(response({ positions: savedPositions }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    await user.click(
      await screen.findByRole("button", { name: "Editar classificação" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Geografia" }));
    await user.click(await screen.findByRole("option", { name: "Brasil" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar classificação" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Classificação salva."),
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        positionId: positions[0].id,
        assetClass: "Renda fixa",
        subClass: "CDB pós-fixado",
        geography: "Brasil",
      }),
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("saves allocation targets with PUT and reloads the empty portfolio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [], targetPercentages: {} }))
      .mockResolvedValueOnce(response({ message: "Metas salvas." }))
      .mockResolvedValueOnce(
        response({ positions: [], targetPercentages: { "Renda fixa": 100 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);

    await user.click(
      await screen.findByRole("button", { name: "Definir metas" }),
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "100",
    );
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({
        targetPercentages: {
          "Renda fixa": 100,
          "Renda variável": 0,
          Fundos: 0,
          Criptoativos: 0,
          Imóveis: 0,
          Outros: 0,
        },
      }),
    });
    expect(toast.success).toHaveBeenCalledWith("Metas de alocação salvas.");
  });

  it("reports failed target saves without closing the editor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [], targetPercentages: {} }))
      .mockResolvedValueOnce(response({ message: "failed" }, false));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);

    await user.click(
      await screen.findByRole("button", { name: "Definir metas" }),
    );
    await user.clear(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
    );
    await user.type(
      screen.getByRole("spinbutton", { name: "Meta de Renda fixa" }),
      "100",
    );
    await user.click(screen.getByRole("button", { name: "Salvar metas" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar as metas de alocação.",
      ),
    );
    expect(screen.getByRole("button", { name: "Salvar metas" })).toBeTruthy();
  });
  it("allows confirming a fully unknown classification", async () => {
    let finishSave:
      | ((value: { ok: boolean; json: () => Promise<unknown> }) => void)
      | undefined;
    const pendingSave = new Promise<{
      ok: boolean;
      json: () => Promise<unknown>;
    }>((resolve) => {
      finishSave = resolve;
    });
    const unclassified = { ...positions[3], totalValue: "250" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [unclassified] }))
      .mockReturnValueOnce(pendingSave)
      .mockResolvedValueOnce(response({ positions: [unclassified] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    await user.click(
      await screen.findByRole("button", { name: "Editar classificação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar classificação" }),
    );
    expect(
      await screen
        .findByRole("button", { name: "Salvando…" })
        .then((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({
        positionId: unclassified.id,
        assetClass: null,
        subClass: null,
        geography: null,
      }),
    });
    finishSave?.(response({ message: "Classificação salva." }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
  it("keeps the editor open and reports failed saves", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [positions[0]] }))
      .mockResolvedValueOnce(response({ message: "failed" }, false));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    await user.click(
      await screen.findByRole("button", { name: "Editar classificação" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar classificação" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a classificação.",
      ),
    );
    expect(screen.getByLabelText("Subclasse")).toBeTruthy();
  });

  it("searches, selects visible positions, and applies only checked bulk fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions }))
      .mockResolvedValueOnce(
        response({ count: 3, message: "Classificação salva." }),
      )
      .mockResolvedValueOnce(response({ positions }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    const list = await screen.findByRole("group", {
      name: "Lista de posições",
    });
    expect(list.className).toContain("max-h-[55vh]");
    expect(list.className).toContain("overflow-y-auto");
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    expect(screen.getByText("4 selecionado(s)")).toBeTruthy();

    await user.type(
      screen.getByLabelText("Buscar por produto ou instituição"),
      "Corretora Exemplo",
    );
    expect(screen.getByText("Selecionar resultados (1)")).toBeTruthy();
    expect(screen.getByText("4 selecionado(s)")).toBeTruthy();
    await user.click(
      screen.getByRole("checkbox", { name: "Selecionar resultados visíveis" }),
    );
    expect(screen.getByText("3 selecionado(s)")).toBeTruthy();
    expect(screen.queryByText("CDB pós-fixado")).toBeNull();

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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        positionIds: [positions[0].id, positions[2].id, positions[3].id],
        geography: null,
      }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Classificação aplicada a 3 posições.",
    );
  });

  it("explains when a search has no matching positions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ positions })));
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );
    await user.type(
      await screen.findByLabelText("Buscar por produto ou instituição"),
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

  it("uses singular wording when a bulk edit applies to one position", async () => {
    const singlePosition = positions[0];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ positions: [singlePosition] }))
      .mockResolvedValueOnce(
        response({ count: 1, message: "Classificação salva." }),
      )
      .mockResolvedValueOnce(response({ positions: [singlePosition] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PortfolioAllocation />);
    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Mostrar.*classifica/i }),
      );

    await user.click(
      await screen.findByRole("checkbox", {
        name: "Selecionar resultados visíveis",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Aplicar subclasse" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Aplicar aos selecionados" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Classificação aplicada a 1 posição.",
      ),
    );
  });
});
