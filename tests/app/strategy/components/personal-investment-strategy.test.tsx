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

const baseData = {
  valuationDate: "2026-10-02",
  valuationDates: ["2026-10-02"],
  longTermWealth: {
    knownValueCents: "100000",
    unvaluedPositionCount: 0,
    positionCount: 4,
    assignedPositionCount: 4,
    unclassifiedKnownValueCents: "0",
    classes: [
      {
        id: "fixed_income",
        label: "Renda fixa",
        knownValueCents: "40000",
        currentPercentage: 40,
      },
      {
        id: "brazilian_equities",
        label: "Ações brasileiras",
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
        label: "FIIs",
        knownValueCents: "10000",
        currentPercentage: 10,
      },
    ],
  },
  destinationsNeedingPurposeConfirmation: 0,
  savedAllocationPercentages: null,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PersonalInvestmentStrategy", () => {
  it("loads the dated long-term composition and excludes unrelated wealth from the strategy view", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(baseData)));
    render(<PersonalInvestmentStrategy />);

    expect(screen.getByRole("status").textContent).toContain(
      "Lendo sua carteira",
    );
    expect(
      await screen.findByText("Patrimônio destinado ao longo prazo"),
    ).toBeTruthy();
    expect(screen.getByText(/R\$\s*1\.000,00/)).toBeTruthy();
    expect(screen.getByText("Em 02/10/2026")).toBeTruthy();
    expect(
      screen.getByText(
        /Reserva, objetivos pessoais e posições sem destino ficam fora/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Sua composição de longo prazo")).toBeTruthy();
    expect(screen.queryByText("O que importa para você?")).toBeNull();
    expect(screen.getByText(/não é uma recomendação/)).toBeTruthy();
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

    expect(
      await screen.findByText("Patrimônio destinado ao longo prazo"),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
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
    expect(screen.getByText(/R\$\s*5,00 não se enquadram/)).toBeTruthy();
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
    const request = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(baseData))
      .mockResolvedValueOnce(
        jsonResponse({
          message: "Composição salva.",
          allocationPercentages: {
            fixed_income: 0,
            brazilian_equities: 30,
            international_etfs: 20,
            fiis: 50,
          },
        }),
      );
    vi.stubGlobal("fetch", request);
    const user = userEvent.setup();
    render(<PersonalInvestmentStrategy />);
    await screen.findByText("Sua composição de longo prazo");
    for (const [label, value] of [
      ["Renda fixa escolhida (%)", "0"],
      ["Ações brasileiras escolhida (%)", "30"],
      ["ETFs internacionais escolhida (%)", "20"],
      ["FIIs escolhida (%)", "50"],
    ]) {
      fireEvent.change(screen.getByRole("spinbutton", { name: label }), {
        target: { value },
      });
    }
    await user.click(screen.getByRole("button", { name: "Salvar composição" }));

    await waitFor(() =>
      expect(
        screen.getByText(/Última composição salva permanece/),
      ).toBeTruthy(),
    );
    expect(request).toHaveBeenLastCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({ method: "POST" }),
    );
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
