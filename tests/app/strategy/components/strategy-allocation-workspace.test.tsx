// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategyAllocationWorkspace } from "@/app/strategy/_components/strategy-allocation-workspace";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 500, height: 220 },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  },
});

const classes = [
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
];
const percentages = {
  fixed_income: 40,
  brazilian_equities: 30,
  international_etfs: 20,
  fiis: 10,
};
const baseProps = {
  classes,
  knownValueCents: "100000",
  valuationDate: "2026-10-02",
  positionCount: 4,
  unclassifiedKnownValueCents: "0",
  unvaluedPositionCount: 0,
  savedAllocationPercentages: null,
  allocationActive: false,
  onSaved: vi.fn(),
  onActivated: vi.fn(),
};

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  } as Response);
}

function input(label: string) {
  const accessibleName = label.startsWith("Valor") ? "Valor disponível" : label;
  if (
    label.startsWith("Renda") ||
    label.startsWith("Ações") ||
    label.startsWith("ETFs") ||
    label.startsWith("Fundos imobiliários (FIIs)")
  ) {
    openEditor();
  }
  return screen.getByRole("textbox", {
    name: accessibleName,
  }) as HTMLInputElement;
}

function openEditor() {
  if (
    !screen.queryByRole("textbox", {
      name: "Renda fixa planejada em porcentagem",
    })
  ) {
    fireEvent.click(screen.getByRole("button", { name: "Editar composição" }));
  }
}

function setPercentages(values: [string, string, string, string]) {
  [
    "Renda fixa planejada em porcentagem",
    "Ações e BDRs planejada em porcentagem",
    "ETFs internacionais planejada em porcentagem",
    "Fundos imobiliários (FIIs) planejada em porcentagem",
  ].forEach((label, index) => {
    fireEvent.change(input(label), { target: { value: values[index] } });
  });
}

function simulation(complete = true) {
  return {
    enteredContributionCents: "10000",
    reserveContributionCents: "0",
    strategyContributionCents: "10000",
    reserveStatus: "not_configured" as const,
    reserveSelectedValueCents: null,
    reserveTargetValueCents: null,
    reserveDifferenceCents: null,
    simulation: {
      totalCents: "100000",
      contributionCents: "10000",
      unallocatedContributionCents: "2000",
      completeness: {
        complete,
        unvaluedPositionCount: complete ? 0 : 1,
        unclassifiedKnownValueCents: "500",
        valuationDate: "2026-10-02",
        valuationDates: complete ? ["2026-10-02"] : ["2026-10-01"],
      },
      allocations: [
        {
          id: "fixed_income",
          label: "Renda fixa",
          currentPercentage: 40,
          targetPercentage: 40,
          projectedPercentage: 40,
          contributionValueCents: "8000",
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.error.mockReset();
  toast.success.mockReset();
  baseProps.onSaved.mockReset();
  baseProps.onActivated.mockReset();
});

describe("StrategyAllocationWorkspace", () => {
  it("shows current composition first and opens percentage editing in a sheet", () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);
    expect(
      screen.queryByRole("textbox", {
        name: "Renda fixa planejada em porcentagem",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Editar composição" }),
    ).toBeTruthy();
    expect(screen.getByText("Patrimônio de longo prazo")).toBeTruthy();
    expect(screen.getByText("Distribuição atual")).toBeTruthy();
    expect(screen.getAllByText("30,00%").length).toBeGreaterThan(0);
    expect(screen.getByText("10%")).toBeTruthy();
    const learningLink = screen.getByRole("link", {
      name: "Aprender sobre Fundos imobiliários (FIIs)",
    });
    expect(learningLink.getAttribute("href")).toBe(
      "/learn?class=fiis#class-content",
    );
    expect(learningLink.textContent).toBe("Aprender");
    input("Renda fixa planejada em porcentagem");
    expect(screen.getByRole("dialog").className).toContain("sm:max-w-2xl");
    expect(input("Renda fixa planejada em porcentagem").value).toBe("40,00");
    expect(screen.getByText("Total planejado")).toBeTruthy();
    expect(screen.getByText("100,00%", { selector: "strong" })).toBeTruthy();
    expect(
      screen.getByText("Composição dentro do total de 100%."),
    ).toBeTruthy();
    const classCards = screen.getByRole("dialog").querySelectorAll("section");
    expect(classCards).toHaveLength(4);
    expect(classCards[0]?.textContent).toContain("Renda fixa");
    expect(classCards[0]?.textContent).toContain("Valor atual");
    expect(classCards[0]?.textContent?.replace(/\u00a0/g, " ")).toContain(
      "R$ 400,00",
    );
    expect(classCards[3]?.textContent).toContain("Fundos imobiliários (FIIs)");
    expect(classCards[3]?.textContent?.replace(/\u00a0/g, " ")).toContain(
      "R$ 100,00",
    );
    expect(screen.getByText("Distribuição por classe")).toBeTruthy();
    fireEvent.change(input("Renda fixa planejada em porcentagem"), {
      target: { value: "40," },
    });
    expect(input("Renda fixa planejada em porcentagem").value).toBe("40,");
    setPercentages(["100", "0", "0", "0"]);
    expect(screen.getByText("100,00%", { selector: "strong" })).toBeTruthy();
    expect(input("Ações e BDRs planejada em porcentagem").value).toBe("0");
    fireEvent.change(input("Renda fixa planejada em porcentagem"), {
      target: { value: "101" },
    });
    expect(screen.getByText("Ajustando composição")).toBeTruthy();
    expect(
      screen.getByText("Complete o total para ver a composição."),
    ).toBeTruthy();
  });

  it("shows one decorative class image in each row of the composition editor", () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelectorAll("img")).toHaveLength(0);

    openEditor();

    const classRows = screen.getByRole("dialog").querySelectorAll("section");
    expect(classRows).toHaveLength(4);
    classRows.forEach((row) => {
      const image = row.querySelector("img");
      expect(image).not.toBeNull();
      expect(image!.getAttribute("alt")).toBe("");
      expect(image!.className).toContain("object-cover");
      expect(image!.className).toContain("shrink-0");
    });
    expect(document.querySelectorAll("img")).toHaveLength(4);
    expect(
      Array.from(document.querySelectorAll("img")).every((image) =>
        screen.getByRole("dialog").contains(image),
      ),
    ).toBe(true);
  });

  it("shows zero current value when a class has no classified positions", () => {
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        classes={[]}
        knownValueCents="90000"
        positionCount={0}
      />,
    );

    expect(screen.getByText("Defina a composição desejada.")).toBeTruthy();
    input("Renda fixa planejada em porcentagem");
    expect(input("Renda fixa planejada em porcentagem").value).toBe("");
  });

  it("restores the currency caret and falls back when selection is unavailable", async () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);
    const amount = input("Valor do aporte");
    const setSelectionRange = vi.spyOn(amount, "setSelectionRange");
    await userEvent.type(amount, "123");
    await waitFor(() => expect(setSelectionRange).toHaveBeenCalled());

    const updatedAmount = input("Valor do aporte");
    Object.defineProperties(updatedAmount, {
      selectionStart: { configurable: true, get: () => null },
      selectionEnd: { configurable: true, get: () => null },
      selectionDirection: { configurable: true, get: () => null },
    });
    const fallbackSetSelectionRange = vi.spyOn(
      updatedAmount,
      "setSelectionRange",
    );
    fireEvent.change(updatedAmount, { target: { value: "R$ 1,234" } });
    await waitFor(() => expect(fallbackSetSelectionRange).toHaveBeenCalled());
  });

  it("distributes the remainder only when explicitly requested", async () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);
    openEditor();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Distribuir restante" })[0]!,
    );
    expect(input("Renda fixa planejada em porcentagem").value).toBe("40,00");
    expect(input("Ações e BDRs planejada em porcentagem").value).toBe("20,00");
    expect(input("ETFs internacionais planejada em porcentagem").value).toBe(
      "20,00",
    );
    expect(
      input("Fundos imobiliários (FIIs) planejada em porcentagem").value,
    ).toBe("20,00");
  });

  it("saves a validated composition without activating the assistant source", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        message: "Salva",
        allocationPercentages: percentages,
      }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar composição" }),
    );
    await waitFor(() =>
      expect(baseProps.onSaved).toHaveBeenCalledWith(percentages),
    );
    expect(
      screen.queryByRole("textbox", {
        name: "Renda fixa planejada em porcentagem",
      }),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({
        body: JSON.stringify({ allocationPercentages: percentages }),
      }),
    );
    expect(baseProps.onActivated).not.toHaveBeenCalled();
    expect(
      screen.getByText(/continua ativa até você escolher a Estratégia/),
    ).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Salva");
  });

  it("shows safe API and network errors when saving", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse(
        { message: "Conflito informado pelo servidor" },
        false,
      ),
    );
    const { rerender } = render(<StrategyAllocationWorkspace {...baseProps} />);
    openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar composição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Conflito informado pelo servidor",
      ),
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private network detail"));
    rerender(
      <StrategyAllocationWorkspace
        {...baseProps}
        savedAllocationPercentages={percentages}
      />,
    );
    openEditor();
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar composição" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível salvar a composição.",
      ),
    );
  });

  it("activates the saved Strategy only through its separate explicit action", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({ allocationPercentages: percentages }),
    );
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        savedAllocationPercentages={percentages}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Usar Estratégia no assistente",
      }),
    );
    await waitFor(() => expect(baseProps.onActivated).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/strategy",
      expect.objectContaining({
        body: JSON.stringify({ activateContributionPlanning: true }),
      }),
    );
    expect(
      screen.getByText("Usando esta composição para posições de Longo Prazo."),
    ).toBeTruthy();
    expect(toast.success).toHaveBeenCalled();
  });

  it("keeps activation errors visible as toast and does not activate", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({ message: "Salva" }),
    );
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        savedAllocationPercentages={percentages}
      />,
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({ message: "Ativação recusada" }, false),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Usar Estratégia no assistente",
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Ativação recusada"),
    );
    expect(baseProps.onActivated).not.toHaveBeenCalled();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private"));
    await userEvent.click(
      screen.getByRole("button", {
        name: "Usar Estratégia no assistente",
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível ativar a composição.",
      ),
    );
  });

  it("simulates BRL input with the canonical Strategy and explains partial values", async () => {
    vi.mocked(fetch).mockResolvedValue(await jsonResponse(simulation(false)));
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 1.234,56" },
    });
    expect(input("Valor do aporte").value).toBe("R$ 1.234,56");
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );
    await waitFor(() => expect(screen.getByText("Plano parcial")).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      "/api/portfolio/strategy/contribution",
      expect.objectContaining({
        body: JSON.stringify({
          contributionAmount: 1234.56,
          allocationPercentages: percentages,
        }),
      }),
    );
    expect(screen.getByText(/posição\(ões\) sem valor/)).toBeTruthy();
    expect(screen.getByText(/Não distribuído/)).toBeTruthy();
  });

  it("distinguishes the entered contribution from the reserve and long-term amounts", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        ...simulation(true),
        reserveContributionCents: "3000",
        strategyContributionCents: "7000",
        reserveStatus: "applied",
      }),
    );
    const { container } = render(
      <StrategyAllocationWorkspace {...baseProps} />,
    );
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    await screen.findByText("R$ 100,00");
    const steps = container.querySelectorAll("ol li");
    expect(steps).toHaveLength(5);
    expect(steps[0]?.textContent?.replace(/\u00a0/g, " ")).toContain(
      "R$ 100,00",
    );
    expect(steps[2]?.textContent?.replace(/\u00a0/g, " ")).toContain(
      "R$ 30,00",
    );
    expect(screen.getByText("Completar reserva")).toBeTruthy();
    const remaining = screen.getByText("Restante para Longo Prazo");
    expect(
      remaining.parentElement?.textContent?.replace(/\u00a0/g, " "),
    ).toContain("R$ 70,00");
    expect(screen.getByText("Distribuição do longo prazo")).toBeTruthy();
    expect(screen.queryByText("Distribuído por classe")).toBeNull();
  });

  it("uses the shared class colors for tinted contribution cards", async () => {
    const allocations = [
      ["fixed_income", "Renda fixa", "1000"],
      ["brazilian_equities", "Ações e BDRs", "4000"],
      ["international_etfs", "ETFs internacionais", "3000"],
      ["fiis", "Fundos imobiliários (FIIs)", "0"],
    ].map(([id, label, contributionValueCents]) => ({
      id,
      label,
      currentPercentage: 0,
      targetPercentage: 25,
      projectedPercentage: 25,
      contributionValueCents,
    }));
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        ...simulation(true),
        simulation: {
          ...simulation(true).simulation,
          allocations,
        },
      }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    const title = await screen.findByText("Distribuição do longo prazo");
    const cards = title.parentElement?.querySelectorAll("ul li");
    expect(cards).toHaveLength(4);
    expect(cards?.[0]?.getAttribute("style")).toContain(
      "color-mix(in srgb, var(--asset-class-fixed-income) 10%, var(--card))",
    );
    expect(cards?.[1]?.getAttribute("style")).toContain(
      "color-mix(in srgb, var(--asset-class-brazilian-equities) 10%, var(--card))",
    );
    expect(cards?.[2]?.getAttribute("style")).toContain(
      "color-mix(in srgb, var(--asset-class-international-etfs) 10%, var(--card))",
    );
    expect(cards?.[3]?.getAttribute("style")).toContain(
      "color-mix(in srgb, var(--asset-class-fiis) 10%, var(--card))",
    );
    expect(screen.getByText("R$ 10,00")).toBeTruthy();
    expect(screen.getAllByText("25,00% depois do aporte")).toHaveLength(4);
  });

  it("shows unavailable long-term contribution when reserve data is incomplete", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        ...simulation(true),
        reserveContributionCents: null,
        strategyContributionCents: null,
        reserveStatus: "incomplete",
        reserveTargetValueCents: "4800000",
        simulation: null,
      }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    expect(
      await screen.findByText("Não foi possível calcular a parte da Reserva"),
    ).toBeTruthy();
    expect(screen.getAllByText("Indisponível")).toHaveLength(2);
    expect(screen.getByText(/Meta da Reserva/)).toBeTruthy();
  });

  it("keeps the allocation step at zero when no long-term simulation is available", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        ...simulation(true),
        reserveContributionCents: "10000",
        strategyContributionCents: "0",
        reserveStatus: "applied",
        simulation: null,
      }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    const zeroValues = await screen.findAllByText("R$ 0,00");
    expect(zeroValues.length).toBeGreaterThan(0);
    expect(screen.getByText("Completar reserva")).toBeTruthy();
    expect(screen.queryByText("Plano estimado")).toBeNull();
    expect(screen.queryByText("Plano parcial")).toBeNull();
    expect(screen.queryByText("Plano aproximado")).toBeNull();
  });

  it("shows the full contribution for long-term when the reserve is complete", async () => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({ ...simulation(true), reserveStatus: "not_needed" }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    expect(await screen.findByText("Reserva completa")).toBeTruthy();
    const remaining = screen.getByText("Restante para Longo Prazo");
    expect(
      remaining.parentElement?.textContent?.replace(/\u00a0/g, " "),
    ).toContain("R$ 100,00");
  });

  it.each([
    {
      dates: ["2026-10-02"],
      title: /Plano estimado/,
    },
    {
      dates: ["2026-10-01"],
      title: /Plano aproximado/,
    },
  ])("labels complete valuations consistently", async ({ dates, title }) => {
    vi.mocked(fetch).mockResolvedValue(
      await jsonResponse({
        ...simulation(true),
        simulation: {
          ...simulation(true).simulation,
          unallocatedContributionCents: "0",
          completeness: {
            ...simulation(true).simulation.completeness,
            valuationDates: dates,
          },
        },
      }),
    );
    render(<StrategyAllocationWorkspace {...baseProps} />);
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 100,00" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );

    expect(await screen.findByText(title)).toBeTruthy();
  });

  it("shows amount validation inline and safe API or network simulation errors via toast", async () => {
    render(<StrategyAllocationWorkspace {...baseProps} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );
    expect(
      screen.getByText(
        "Informe um aporte maior que zero, com até duas casas decimais.",
      ),
    ).toBeTruthy();
    fireEvent.change(input("Valor do aporte"), {
      target: { value: "R$ 1,00" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({ message: "Falha de simulação" }, false),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha de simulação"),
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error("private"));
    await userEvent.click(
      screen.getByRole("button", { name: "Simular aporte" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível simular este aporte.",
      ),
    );
  });

  it("keeps incomplete current wealth visible without inventing a complete baseline", () => {
    render(
      <StrategyAllocationWorkspace
        {...baseProps}
        knownValueCents="90000"
        unclassifiedKnownValueCents="10000"
        unvaluedPositionCount={1}
      />,
    );
    openEditor();
    expect(
      screen.getByText(/Parte do patrimônio de Longo Prazo está sem valor/),
    ).toBeTruthy();
    expect(
      input("Fundos imobiliários (FIIs) planejada em porcentagem").value,
    ).toBe("");
  });
});
