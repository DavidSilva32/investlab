// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrategyGuidance } from "@/app/portfolio/_components/strategy-guidance";

describe("StrategyGuidance", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ context: null }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reveals relevant variable-income types and saved context progressively", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          context: { objective: "Viajar em 2030", targetMonth: "2030-06" },
        }),
      }),
    );
    const onOpenTargets = vi.fn();
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={onOpenTargets} />);

    expect(
      screen.queryByRole("group", { name: /tipos de renda variável/i }),
    ).toBeNull();
    expect(
      screen.queryByText(/liquidez imediata|oscilações no valor/i),
    ).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Renda variável" }));
    expect(
      screen.getByRole("group", { name: /tipos de renda variável/i }),
    ).toBeTruthy();
    expect(await screen.findByText(/Viajar em 2030/)).toBeTruthy();
    expect(screen.getByText(/junho de 2030/)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Ações" }));
    await user.click(screen.getByRole("checkbox", { name: "ETFs de ações" }));
    await user.click(screen.getByRole("checkbox", { name: "FIIs" }));
    await user.click(screen.getByRole("checkbox", { name: "Fundos de ações" }));
    await user.click(screen.getByRole("checkbox", { name: "BDRs" }));

    expect(
      screen.getByText(/categoria inclui instrumentos diferentes/i),
    ).toBeTruthy();
    expect(screen.getByText(/Existem também ETFs de renda fixa/i)).toBeTruthy();
    expect(
      screen.getByText(
        /podem representar ações, cotas de ETFs ou títulos de dívida/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Sem identificar o lastro, não dá para dizer qual tipo de exposição/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(
      expect.arrayContaining([
        "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos/acoes",
        "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/etfs",
        "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii",
        "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos",
        "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/brazilian-depositary-receipts-bdrs",
      ]),
    );
    expect(screen.queryByText(/Uma ação representa participação/i)).toBeNull();
    expect(onOpenTargets).not.toHaveBeenCalled();
  });

  it("clears type choices and opens target editing only after the button is confirmed", async () => {
    const onOpenTargets = vi.fn();
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={onOpenTargets} />);

    await user.click(screen.getByRole("checkbox", { name: "Renda variável" }));
    await user.click(screen.getByRole("checkbox", { name: "FIIs" }));
    expect(screen.getByRole("heading", { name: "FIIs" })).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Renda variável" }));
    expect(
      screen.queryByRole("group", { name: /tipos de renda variável/i }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: "FIIs" })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Fundos" }));
    expect(onOpenTargets).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /Nada será alterado nas suas metas até você revisar e salvar/i,
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /Revisar minhas metas/i }),
    );
    expect(onOpenTargets).toHaveBeenCalledWith(["Fundos"]);
  });

  it("offers retry when saved context cannot be loaded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          context: { objective: "Planejar uma mudança", targetMonth: null },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Fundos" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText(/Planejar uma mudança/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows other class explanations without an unnecessary link", async () => {
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Imóveis" }));
    expect(
      screen.getByRole("heading", { name: "Sobre as classes escolhidas" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/não identifica um instrumento imobiliário específico/i),
    ).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("supports selecting and deselecting BDR exploration explicitly", async () => {
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Renda variável" }));
    await user.click(screen.getByRole("checkbox", { name: "BDRs" }));
    expect(screen.getByRole("heading", { name: "BDRs" })).toBeTruthy();
    expect(screen.getByText(/títulos de dívida/i)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "BDRs" }));
    expect(screen.queryByRole("heading", { name: "BDRs" })).toBeNull();
  });
});
