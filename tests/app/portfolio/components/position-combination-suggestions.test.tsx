// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { PositionCombinationSuggestions } from "@/app/portfolio/_components/position-combination-suggestions";
import { todayInSaoPaulo } from "@/lib/valuation-date";

const holdings = [
  {
    assetKey: "inter-box",
    product: "CDB Inter daily liquidity",
    institution: "Banco Inter",
    value: 30_000,
    canonicalValueSource: "CDB_ESTIMATE",
    estimationBaseDate: "2026-09-16",
    estimatedThrough: "2026-09-18",
    cdbEstimateStatus: "provisional" as const,
    cdbEstimateLimitation:
      "Ainda não há taxa CDI oficial para os dias seguintes.",
  },
  {
    assetKey: "inter-named",
    product: "CDB 115% CDI",
    institution: "Banco Inter",
    value: 17_250.9,
  },
  {
    assetKey: "unvalued",
    product: "CDB no value",
    institution: "Banco B",
    value: null,
  },
];

afterEach(() => {
  cleanup();
  toast.error.mockReset();
  vi.unstubAllGlobals();
});

function render(ui: ReactElement) {
  const result = rtlRender(ui);
  fireEvent.click(
    result.getByRole("button", { name: /Buscar uma combinação pelo valor/ }),
  );
  return result;
}

describe("PositionCombinationSuggestions", () => {
  it("keeps the amount, date, and search controls in a wrapping layout", () => {
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Saldo atual da Reserva no banco"
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );

    const amount = screen.getByLabelText("Saldo atual da Reserva no banco");
    const controls = amount.parentElement?.parentElement;

    expect(controls?.className).toContain("flex-wrap");
    expect(controls?.className).toContain("items-end");
    expect(
      controls?.contains(screen.getByLabelText("Data consultada no banco")),
    ).toBe(true);
    expect(
      controls?.contains(screen.getByRole("button", { name: /Buscar combin/ })),
    ).toBe(true);
  });

  it("masks typed digits as Brazilian currency and requires review before apply", async () => {
    const onApply = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "suggestions",
        kind: "exact",
        candidates: [
          {
            assetKeys: ["inter-box", "inter-named"],
            total: 47_274.91,
            difference: 0,
            positions: [
              {
                ...holdings[0],
                valueCents: "3000000",
              },
              {
                ...holdings[1],
                valueCents: "1725090",
                canonicalValueSource: "UNRECOGNIZED_PROVIDER",
                estimationBaseDate: "2026-09-16",
                estimatedThrough: "2026-09-18",
                cdbEstimateStatus: "complete",
                cdbEstimateLimitation: "Data-base CURVA não confirmada.",
              },
            ],
          },
        ],
        searchLimited: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={onApply}
      />,
    );

    const amount = screen.getByLabelText("Valor conhecido da reserva");
    await user.type(amount, "4727491");
    expect((amount as HTMLInputElement).value).toBe("R$ 47.274,91");
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));

    const review = await screen.findByRole("button", {
      name: /Ver 2 posições/,
    });
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Exata")).toBeTruthy();
    expect(screen.queryByText("CDB Inter daily liquidity")).toBeNull();
    expect(screen.getByRole("button", { name: /Usar esta/ })).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/emergency-reserve/suggestions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetAmount: 47274.91,
          valuationDate: todayInSaoPaulo(),
        }),
      },
    );

    await user.click(review);
    expect(review.getAttribute("aria-expanded")).toBe("true");
    expect(review.querySelector("svg")?.className.baseVal).toContain(
      "group-data-[state=open]:rotate-180",
    );
    expect(screen.getByText("CDB Inter daily liquidity")).toBeTruthy();
    expect(screen.getByText("Data-base CURVA não confirmada.")).toBeTruthy();
    expect(screen.getByText("Origem: UNRECOGNIZED_PROVIDER")).toBeTruthy();
    expect(
      screen.getAllByText("Estimativa aproximada até 18/09/2026"),
    ).toHaveLength(1);
    expect(
      screen.getByText("Ainda não há taxa CDI oficial para os dias seguintes."),
    ).toBeTruthy();
    expect(screen.getByText("CDB 115% CDI")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Usar esta/ }));
    expect(screen.getByRole("status").textContent).toContain("rascunho");
    expect(onApply).toHaveBeenCalledWith(
      ["inter-box", "inter-named"],
      expect.objectContaining({
        assetKeys: ["inter-box", "inter-named"],
        difference: 0,
      }),
    );
  });

  it("keeps nearest candidates compact until reviewed", async () => {
    const onApply = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "nearest",
          candidates: [
            {
              assetKeys: ["inter-box"],
              total: 30_000,
              difference: 1_000,
              transfers: [
                {
                  assetKey: "inter-box",
                  product: "CDB Inter daily liquidity",
                  value: 30_000,
                  fromObjectiveId: "trip",
                  fromObjectiveName: "Viagem",
                  toObjectiveId: "reserve",
                },
              ],
            },
          ],
          searchLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings.slice(0, 1)}
        onApply={onApply}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "3100000",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { name: /Nenhuma combin/ }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Diferen/).nextElementSibling?.textContent,
    ).toContain("1.000,00");
    expect(screen.queryByText("CDB Inter daily liquidity")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("sends the editable Sao Paulo comparison date and displays the evaluated position date", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "suggestions",
        kind: "nearest",
        valuationDate: "2026-09-30",
        candidates: [
          {
            assetKeys: ["inter-box"],
            total: 30_000,
            difference: 100,
            positions: [
              {
                ...holdings[0],
                value: 30_000,
                valueCents: "3000000",
                estimatedThrough: "2026-09-29",
                cdbEstimateStatus: "complete",
                cdbEstimateComparisonApproximate: true,
              },
            ],
          },
        ],
        searchLimited: false,
        alternativesLimited: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Saldo atual da reserva"
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Saldo atual da reserva"), "3000000");
    const dateInput = screen.getByLabelText("Data consultada no banco");
    await user.clear(dateInput);
    await user.type(dateInput, "30/09/2026");
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );

    await screen.findByText(/Data informada: 30\/09\/2026/);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      targetAmount: 30_000,
      valuationDate: "2026-09-30",
    });
    await user.click(screen.getByRole("button", { name: "Ver 1 posições" }));
    const valuationDetails = screen.getAllByText(/29\/09\/2026/);
    expect(
      valuationDetails.some((detail) =>
        /aproximada/.test(detail.textContent ?? ""),
      ),
    ).toBe(true);
  });

  it("marks an imported reference value as approximate when no CDI estimate is available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "nearest",
          valuationDate: "2026-09-30",
          candidates: [
            {
              assetKeys: ["inter-named"],
              total: 17_250.9,
              difference: 50,
              positions: [
                {
                  ...holdings[1],
                  valueCents: "1725090",
                  canonicalValueSource: "B3_IMPORTED",
                  referenceDate: "2026-09-29",
                },
              ],
            },
          ],
          searchLimited: false,
          alternativesLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Saldo atual"
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Saldo atual"), "1725090");
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );
    await screen.findByText(/Data informada: 30\/09\/2026/);
    await user.click(screen.getByRole("button", { name: "Ver 1 posições" }));
    expect(
      screen.getByText(
        /Comparação aproximada: valor importado com referência B3 de 29\/09\/2026/,
      ),
    ).toBeTruthy();
  });

  it("does not send a search for a comparison date in the future", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Saldo atual"
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Saldo atual"), "3000000");
    const dateInput = screen.getByLabelText("Data consultada no banco");
    await user.clear(dateInput);
    await user.type(dateInput, "31/12/2099");
    await user.click(
      screen.getByRole("button", { name: "Buscar combinações" }),
    );

    expect(
      await screen.findByRole("alert").then((alert) => alert.textContent),
    ).toContain("igual ou anterior a hoje");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows known objective value when transfer progress is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "exact",
          candidates: [
            {
              assetKeys: ["inter-box"],
              total: 30_000,
              difference: 0,
              transfers: [
                {
                  assetKey: "inter-box",
                  product: "CDB Inter daily liquidity",
                  value: 30_000,
                  fromObjectiveId: "goal-trip",
                  fromObjectiveName: "Viagem",
                  toObjectiveId: "reserve",
                },
              ],
              impacts: [
                {
                  objectiveId: "goal-trip",
                  objectiveName: "Viagem",
                  currentValue: 30_000,
                  knownValue: 30_000,
                  targetAmount: 40_000,
                  progressPercent: null,
                  transferredValue: 30_000,
                  transferredPositionCount: 1,
                },
              ],
            },
          ],
          searchLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings.slice(0, 1)}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "3000000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    await user.click(
      await screen.findByRole("button", { name: "Ver 1 posições" }),
    );
    expect(
      screen.getByText(/Viagem: R\$ 30\.000,00 de R\$ 40\.000,00/),
    ).toBeTruthy();
    expect(screen.queryByText(/40\.000,00 ·/)).toBeNull();
  });

  it("keeps the input locked while a request is pending", async () => {
    let resolveResponse: (response: {
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }) => void = () => {};
    const pendingResponse = new Promise<{
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingResponse),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.type(amount, "10000");
    await user.click(search);
    expect(amount.getAttribute("disabled")).not.toBeNull();
    expect(search.getAttribute("disabled")).not.toBeNull();
    resolveResponse({
      ok: true,
      json: async () => ({ status: "no_valued_positions" }),
    });
    expect(await screen.findByText(/grupos com valor atual/)).toBeTruthy();
  });

  it("rejects empty and zero values without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(search);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "valor maior que zero",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a safe fallback toast when the API error has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect(toast.error).toHaveBeenCalledWith(
      "Não foi possível buscar combinações agora. Tente novamente.",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows partial-search and tied-alternative limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "nearest",
          candidates: [
            {
              assetKeys: ["inter-box"],
              total: 30_000,
              difference: 1_000,
              transfers: [
                {
                  assetKey: "inter-box",
                  product: "CDB Inter daily liquidity",
                  value: 30_000,
                  fromObjectiveId: "trip",
                  fromObjectiveName: "Viagem",
                  toObjectiveId: "reserve",
                },
              ],
            },
          ],
          searchLimited: true,
          alternativesLimited: true,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "3100000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect(
      await screen.findByRole("heading", { name: /Busca parcial/ }),
    ).toBeTruthy();
    expect(screen.getByText(/A busca foi interrompida/)).toBeTruthy();
    expect(
      screen.getByText(/Esta opção inclui transferência; a busca foi parcial/),
    ).toBeTruthy();
    expect(screen.getByText(/outras alternativas/)).toBeTruthy();
  });

  it("renders invalid, oversized, and empty-result response states", async () => {
    const results = [
      { status: "invalid_target" },
      { status: "too_many_positions", maximum: 40 },
      {
        status: "suggestions",
        kind: "nearest",
        candidates: [],
        searchLimited: true,
        alternativesLimited: false,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => results.shift(),
      })),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect(await screen.findByText(/Informe um valor/)).toBeTruthy();
    await user.click(search);
    expect(await screen.findByText(/comporta/)).toBeTruthy();
    expect(screen.getByText(/Selecione os grupos manualmente/)).toBeTruthy();
    await user.click(search);
    expect(
      await screen.findByText(/selecionar os grupos manualmente/),
    ).toBeTruthy();
    expect(screen.getByText(/A busca foi limitada/)).toBeTruthy();
  });

  it("shows a safe API message once and can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "Falha segura." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "no_valued_positions" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    const search = screen.getByRole("button", { name: /Buscar combin/ });
    await user.click(search);
    expect(toast.error).toHaveBeenCalledWith("Falha segura.");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(search);
    expect(await screen.findByText(/grupos com valor atual/)).toBeTruthy();
  });
  it("leaves the field empty when input has no digits", async () => {
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText("Valor conhecido da reserva");
    await user.type(amount, "abc");
    expect((amount as HTMLInputElement).value).toBe("");
  });

  it("keeps multiple exact alternatives visible for review", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "suggestions",
          kind: "exact",
          candidates: [
            { assetKeys: ["inter-box"], total: 100, difference: 0 },
            { assetKeys: ["inter-named"], total: 100, difference: 0 },
          ],
          searchLimited: false,
          alternativesLimited: false,
        }),
      }),
    );
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    await user.type(
      screen.getByLabelText("Valor conhecido da reserva"),
      "10000",
    );
    await user.click(screen.getByRole("button", { name: /Buscar combin/ }));
    expect(
      await screen.findByRole("heading", {
        name: /Mais de uma combina.*corresponde ao valor/,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("Exata")).toHaveLength(2);
  });
  it("handles unavailable native selection data", () => {
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    Object.defineProperties(amount, {
      selectionStart: { configurable: true, value: null },
      selectionEnd: { configurable: true, value: null },
      selectionDirection: { configurable: true, value: null },
    });

    fireEvent.change(amount, { target: { value: "1234" } });

    expect(amount.value).toBe("R$ 12,34");
  });

  it("restores the caret around empty and normalized digit input", async () => {
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    await user.type(amount, "1");

    fireEvent.change(amount, {
      target: { value: "21", selectionStart: 0, selectionEnd: 0 },
    });
    expect(amount.value).toBe("R$ 0,21");
    expect(amount.selectionStart).toBe(3);

    fireEvent.change(amount, {
      target: { value: "abc", selectionStart: 0, selectionEnd: 0 },
    });
    expect(amount.value).toBe("");
    expect(amount.selectionStart).toBe(0);

    fireEvent.change(amount, {
      target: { value: "0001234", selectionStart: 6, selectionEnd: 6 },
    });
    expect(amount.value).toBe("R$ 12,34");
    expect(amount.selectionStart).toBe(amount.value.length);
  });

  it("keeps the caret beside the edited digits in the formatted amount", async () => {
    const user = userEvent.setup();
    render(
      <PositionCombinationSuggestions
        endpoint="/api/emergency-reserve/suggestions"
        title="Encontrar grupos pelo valor"
        description="Digite o valor para comparar."
        amountLabel="Valor conhecido da reserva"
        comparisonDetails="Metodologia de teste."
        holdings={holdings}
        onApply={vi.fn()}
      />,
    );
    const amount = screen.getByLabelText(
      "Valor conhecido da reserva",
    ) as HTMLInputElement;
    await user.type(amount, "4727491");
    amount.setSelectionRange(4, 4);
    await user.keyboard("9");
    expect(amount.value).toBe("R$ 497.274,91");
    expect(amount.selectionStart).toBe(5);
  });
});
