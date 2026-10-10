// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalInvestmentStrategy } from "@/app/strategy/_components/personal-investment-strategy";
import { QueryClientWrapper } from "../../../utils/query-client-wrapper";

const render = (ui: Parameters<typeof rtlRender>[0]) =>
  rtlRender(ui, { wrapper: QueryClientWrapper });

const baseData = {
  valuationDate: "2026-10-02",
  valuationDates: ["2026-10-02"],
  longTermWealth: {
    knownValueCents: "100000",
    unvaluedPositionCount: 0,
    positionCount: 4,
    assignedPositionCount: 4,
    unclassifiedKnownValueCents: "0",
    unclassifiedPositionCount: 0,
    classes: [
      {
        id: "fixed_income",
        label: "Renda fixa",
        knownValueCents: "40000",
        currentPercentage: 40,
      },
      {
        id: "brazilian_equities",
        label: "Ações e BDRs",
        knownValueCents: "30000",
        currentPercentage: 30,
      },
      {
        id: "international_etfs",
        label: "ETFs internacionais",
        knownValueCents: "20000",
        currentPercentage: 20,
      },
      {
        id: "fiis",
        label: "Fundos imobiliários (FIIs)",
        knownValueCents: "10000",
        currentPercentage: 10,
      },
    ],
  },
  destinationsNeedingPurposeConfirmation: 0,
  savedAllocationPercentages: null,
  allocationActive: false,
};

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

function opportunitiesResponse() {
  return {
    opportunities: [],
    asOf: "2026-10-02",
    classificationStatus: "resolved",
    classificationLookupFailures: 0,
    settings: { bazinTargetYield: 6, initializedAt: null },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PersonalInvestmentStrategy", () => {
  it("loads the dated long-term composition and excludes unrelated wealth from the strategy view", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(baseData)));
    render(<PersonalInvestmentStrategy />);

    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Carregando as posições de Longo Prazo e os valores atuais…",
    );
    expect(await screen.findByText("Patrimônio de longo prazo")).toBeTruthy();
    expect(screen.getByText(/R\$\s*1\.000,00/)).toBeTruthy();
    expect(screen.getByText(/02\/10\/2026/)).toBeTruthy();
    expect(screen.getByText("Distribuição por classe")).toBeTruthy();
    expect(screen.queryByText("O que importa para você?")).toBeNull();
    expect(screen.getByText(/não identifica recomendações/)).toBeTruthy();
  });

  it("retries after a blocking load error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ message: "Falha temporária." }, false),
        )
        .mockResolvedValueOnce(jsonResponse(baseData)),
    );
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);

    expect(await screen.findByText("Falha temporária.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Patrimônio de longo prazo")).toBeTruthy();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === "/api/portfolio/strategy"),
    ).toHaveLength(2);
  });

  it("shows a page skeleton while loading and converts a hung request into a retryable error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<PersonalInvestmentStrategy />);
    expect(
      screen.getByRole("status", {
        name: "Carregando as posições de Longo Prazo e os valores atuais…",
      }),
    ).toBeTruthy();

    await act(async () => {
      // React Query schedules the query function after notifying its observer.
      // Flush that microtask before advancing the request timeout itself.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(
      screen.getByText(
        /A carteira demorou mais que 30 segundos para responder/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeTruthy();
  });

  it("shows purpose and valuation coverage limitations, and links to review destinations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...baseData,
          valuationDates: ["2026-09-30", "2026-10-02"],
          longTermWealth: {
            ...baseData.longTermWealth,
            unvaluedPositionCount: 1,
            unclassifiedKnownValueCents: "500",
            unclassifiedPositionCount: 1,
          },
          destinationsNeedingPurposeConfirmation: 2,
        }),
      ),
    );
    render(<PersonalInvestmentStrategy />);

    expect(
      await screen.findByText("2 destino(s) sem finalidade definida"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Revisar destinos" })
        .getAttribute("href"),
    ).toBe("/portfolio?panel=objectives");
    expect(
      screen.getByText(/As posições têm datas efetivas diferentes/),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 posição\(ões\) não têm valor conhecido/),
    ).toBeTruthy();
    expect(
      screen.getByText(/R\$\s*5,00 em posições sem classe identificada/),
    ).toBeTruthy();
  });

  it("reports ambiguous positions that have no known classified value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...baseData,
          longTermWealth: {
            ...baseData.longTermWealth,
            unclassifiedKnownValueCents: "0",
            unclassifiedPositionCount: 1,
          },
        }),
      ),
    );
    render(<PersonalInvestmentStrategy />);

    expect(
      await screen.findByText(/1 posição\(ões\) não têm classe identificada/),
    ).toBeTruthy();
  });

  it("does not show a classification warning when all positions are classifiable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...baseData,
          valuationDates: ["2026-10-01", "2026-10-02"],
        }),
      ),
    );
    render(<PersonalInvestmentStrategy />);

    expect(await screen.findByText("Cobertura dos valores")).toBeTruthy();
    expect(screen.queryByText(/não têm classe identificada/)).toBeNull();
  });

  it("explains the empty state when no position is assigned to long term", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...baseData,
          longTermWealth: {
            ...baseData.longTermWealth,
            knownValueCents: "0",
            positionCount: 0,
            assignedPositionCount: 0,
            classes: [],
          },
        }),
      ),
    );
    render(<PersonalInvestmentStrategy />);

    expect(
      await screen.findByText(
        "Nenhuma posição está atribuída a um destino de longo prazo.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Organizar destinos" }),
    ).toBeTruthy();
  });

  it("saves a new composition through the editor and updates the saved state", async () => {
    const request = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/analyses/portfolio-opportunities")
        return jsonResponse(opportunitiesResponse());
      if (init?.method === "POST")
        return jsonResponse({
          message: "Composição salva.",
          allocationPercentages: {
            fixed_income: 0,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 50,
          },
        });
      return jsonResponse(baseData);
    });
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("Distribuição por classe");
    await user.click(screen.getByRole("button", { name: "Editar composição" }));
    for (const [label, value] of [
      ["Renda fixa planejada em porcentagem", "0"],
      ["Ações e BDRs planejada em porcentagem", "30"],
      ["ETFs internacionais planejada em porcentagem", "20"],
      ["Fundos imobiliários (FIIs) planejada em porcentagem", "50"],
    ]) {
      fireEvent.change(screen.getByRole("textbox", { name: label }), {
        target: { value },
      });
    }
    await user.click(screen.getByRole("button", { name: "Salvar composição" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", {
          name: "Fundos imobiliários (FIIs) planejada em porcentagem",
        }),
      ).toBeNull(),
    );
    await user.click(screen.getByRole("button", { name: "Editar composição" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Fundos imobiliários (FIIs) planejada em porcentagem",
        }) as HTMLInputElement
      ).value,
    ).toBe("50,00");
    expect(request).toHaveBeenLastCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updates the page state after the user explicitly activates Strategy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === "/api/analyses/portfolio-opportunities")
          return jsonResponse(opportunitiesResponse());
        if (init?.method === "POST")
          return jsonResponse({ allocationActive: true });
        return jsonResponse({
          ...baseData,
          savedAllocationPercentages: {
            fixed_income: 40,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 10,
          },
        });
      }),
    );
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("Distribuição por classe");

    await user.click(
      screen.getByRole("button", {
        name: /Usar Estratégia no assistente/,
      }),
    );

    expect(
      await screen.findByText(
        /Usando esta composição para posições de Longo Prazo/,
      ),
    ).toBeTruthy();
  });

  it("renders safe backend and fallback errors when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ message: "A estratégia está indisponível." }, false),
        ),
    );
    render(<PersonalInvestmentStrategy />);
    expect(
      await screen.findByText("A estratégia está indisponível."),
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

  it("ignores a portfolio response after unmount", async () => {
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

  it("ignores a loading error after unmount", async () => {
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
    await waitFor(() =>
      expect(
        screen.queryByText("Não foi possível abrir a estratégia"),
      ).toBeNull(),
    );
  });
});
