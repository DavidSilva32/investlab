// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalInvestmentStrategy } from "@/app/strategy/_components/personal-investment-strategy";

Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: () => {},
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => {},
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => {},
});

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const baseData = {
  valuationDate: "2026-10-02",
  valuationDates: ["2026-09-30", "2026-10-01"],
  totalWealth: {
    knownValueCents: "150000",
    unvaluedPositionCount: 0,
    positionCount: 4,
  },
  longTermWealth: {
    knownValueCents: "100000",
    unvaluedPositionCount: 0,
    positionCount: 2,
    positionsWithoutMaturityDate: 1,
    assignedPositionCount: 2,
    unclassifiedKnownValueCents: "0",
    classes: [
      { id: "fixed_income", label: "Renda fixa", knownValueCents: "40000" },
      {
        id: "brazilian_equities",
        label: "Ações brasileiras",
        knownValueCents: "30000",
      },
      {
        id: "international_etfs",
        label: "ETFs internacionais",
        knownValueCents: "20000",
      },
      { id: "fiis", label: "FIIs", knownValueCents: "10000" },
    ],
  },
  longTermMaturityDates: [
    { date: "2028-10-02", count: 1 },
    { date: "2032-10-02", count: 1 },
  ],
  longTermPositionsWithoutMaturityDate: 1,
  destinationsNeedingPurposeConfirmation: 0,
  savedStrategy: null,
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

describe("PersonalInvestmentStrategy", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    toast.error.mockReset();
    toast.success.mockReset();
  });

  it("loads the canonical portfolio snapshot, explains facts, and lets answers alter directions", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(baseData));
    vi.stubGlobal("fetch", fetch);
    render(<PersonalInvestmentStrategy />);

    expect(
      await screen.findByText("O que sua carteira mostra hoje"),
    ).toBeTruthy();
    expect(screen.getByText("Patrimônio total")).toBeTruthy();
    expect(
      screen.getByText("Destinado à estratégia de longo prazo"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Retrato atual por classe; não são metas nem uma alocação recomendada.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/As fontes disponíveis têm datas efetivas diferentes/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Revisar os prazos da carteira/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Avaliar exposição internacional/ }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Salvar direção escolhida" })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "3" },
    });
    expect(
      screen.getByRole("button", { name: /Revisar os prazos da carteira/ }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /há 1 posição\(ões\) com vencimento cadastrado até 02\/10\/2029/,
      ),
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("combobox", { name: /Você quer considerar/ }),
    );
    await user.click(screen.getByRole("option", { name: "Sim" }));
    expect(
      screen.getByRole("button", { name: /Avaliar exposição internacional/ }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Avaliar exposição internacional/ }),
    );
    await user.click(
      screen.getByRole("combobox", { name: /Você quer considerar/ }),
    );
    await user.click(screen.getByRole("option", { name: "Não por enquanto" }));
    expect(
      screen
        .getByRole("button", { name: "Salvar direção escolhida" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: /Avaliar exposição internacional/ }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Salvar direção escolhida" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: /Revisar os prazos da carteira/ }),
    ).toBeTruthy();
  });

  it("saves the chosen direction without presenting it as an allocation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockResolvedValueOnce(
        jsonResponse({
          message: "Direção salva pelo servidor.",
          strategy: {
            answers: { horizonYears: 5, internationalInterest: "unsure" },
            selectedDirection: "consider_international",
            updatedAt: "2026-10-02T10:00:00.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("O que sua carteira mostra hoje");
    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "5" },
    });
    await user.click(
      screen.getByRole("combobox", { name: /Você quer considerar/ }),
    );
    await user.click(screen.getByRole("option", { name: "Ainda não sei" }));
    await user.click(
      screen.getByRole("button", { name: /Avaliar exposição internacional/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Salvar direção escolhida" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Direção salva pelo servidor.",
      ),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          answers: { horizonYears: 5, internationalInterest: "unsure" },
          selectedDirection: "consider_international",
        }),
      }),
    );
    expect(
      screen.getByText("Esta versão não conclui uma alocação quantitativa"),
    ).toBeTruthy();
    expect(screen.getByText("Sua direção está registrada.")).toBeTruthy();
  });

  it("does not invent a horizon or international preference before the user answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(baseData)));
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("O que sua carteira mostra hoje");
    expect(
      (screen.getByLabelText(/Em quantos anos/) as HTMLInputElement).value,
    ).toBe("");
    expect(
      screen.getByRole("combobox", { name: /Você quer considerar/ })
        .textContent,
    ).toContain("Escolha uma resposta");
    expect(
      screen
        .getByRole("button", { name: "Salvar direção escolhida" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText(
        "Informe seu horizonte para comparar os vencimentos cadastrados.",
      ),
    ).toBeTruthy();
  });

  it("restores a persisted direction and allows changing it", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        ...baseData,
        savedStrategy: {
          answers: { horizonYears: 8, internationalInterest: "not_interested" },
          selectedDirection: "review_horizon",
          updatedAt: "2026-10-01T10:00:00.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("Sua direção está registrada.");
    expect(
      (screen.getByLabelText(/Em quantos anos/) as HTMLInputElement).value,
    ).toBe("8");
    expect(
      screen.queryByRole("button", { name: /Avaliar exposição internacional/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Revisar os prazos da carteira/ }),
    );
    expect(
      screen
        .getByRole("button", { name: /Revisar os prazos da carteira/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows unknown and unclassified amounts without treating them as zero", async () => {
    const partial = {
      ...baseData,
      valuationDates: [],
      totalWealth: {
        knownValueCents: "500",
        unvaluedPositionCount: 1,
        positionCount: 2,
      },
      longTermWealth: {
        ...baseData.longTermWealth,
        knownValueCents: "500",
        unvaluedPositionCount: 1,
        unclassifiedKnownValueCents: "500",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(partial)));
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText(
        /Valores não conhecidos não são tratados como zero/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Classe ou geografia não identificada"),
    ).toBeTruthy();
    expect(
      screen.getAllByText(/posição\(ões\) sem valor conhecido/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText(/As fontes disponíveis têm datas efetivas diferentes/),
    ).toBeNull();
  });

  it("asks to classify legacy destinations and shows the empty long-term state", async () => {
    const legacy = {
      ...baseData,
      destinationsNeedingPurposeConfirmation: 1,
      longTermWealth: {
        ...baseData.longTermWealth,
        positionCount: 0,
        classes: baseData.longTermWealth.classes.filter(
          ({ id }) => id !== "international_etfs",
        ),
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(legacy)));
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText(/destino\(s\) ainda sem finalidade definida/),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Revisar destinos" })).toBeTruthy();
    expect(screen.getByText(/Nenhuma posi/)).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: "Sim" }));
    await user.click(screen.getByRole("button", { name: /Avaliar exposi/ }));
    expect(
      screen.getByText(/em ETFs internacionais identificados/),
    ).toBeTruthy();
  });

  it("keeps the international direction hidden when it is declined and blocks an invalid horizon", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(baseData)));
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("O que sua carteira mostra hoje");
    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "" },
    });
    await user.click(
      screen.getByRole("combobox", { name: /Você quer considerar/ }),
    );
    await user.click(screen.getByRole("option", { name: "Não por enquanto" }));
    expect(
      screen
        .getByRole("button", { name: "Salvar direção escolhida" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: /Avaliar exposição internacional/ }),
    ).toBeNull();
  });

  it("shows API, fallback, network and non-Error loading failures inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ message: "A carteira está indisponível." }, false),
        ),
    );
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText("A carteira está indisponível."),
    ).toBeTruthy();

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText("Não foi possível carregar sua estratégia."),
    ).toBeTruthy();

    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText("Não foi possível carregar sua estratégia."),
    ).toBeTruthy();
  });

  it("uses a safe save fallback when the API rejects the choice", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockResolvedValueOnce(jsonResponse({ message: "" }, false));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("O que sua carteira mostra hoje");
    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "2" },
    });
    await user.click(
      screen.getByRole("combobox", { name: /Você quer considerar/ }),
    );
    await user.click(screen.getByRole("option", { name: "Não por enquanto" }));
    await user.click(screen.getByRole("button", { name: /Revisar os prazos/ }));
    await user.click(
      screen.getByRole("button", { name: "Salvar direção escolhida" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar sua estratégia.",
      ),
    );
  });

  it("uses a safe toast fallback when saving fails in transport", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("O que sua carteira mostra hoje");
    fireEvent.change(screen.getByLabelText(/Em quantos anos/), {
      target: { value: "2" },
    });
    await user.click(screen.getAllByRole("combobox")[0]);
    await user.click(screen.getByRole("option", { name: /por enquanto/ }));
    await user.click(screen.getByRole("button", { name: /Revisar os prazos/ }));
    await user.click(screen.getByRole("button", { name: /Salvar dire/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
  });

  it("ignores a portfolio response when the page unmounts during loading", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      ),
    );
    const { unmount } = render(<PersonalInvestmentStrategy />);
    unmount();
    await act(async () => resolve(jsonResponse(baseData)));
  });

  it("ignores a portfolio failure when the page unmounts during loading", async () => {
    let reject!: (reason: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((_, fail) => {
          reject = fail;
        }),
      ),
    );
    const { unmount } = render(<PersonalInvestmentStrategy />);
    unmount();
    await act(async () => reject(new Error("offline")));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
