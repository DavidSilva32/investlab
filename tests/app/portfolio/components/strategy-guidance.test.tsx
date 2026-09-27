// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrategyGuidance } from "@/app/portfolio/_components/strategy-guidance";

const response = (context: unknown, ok = true) => ({
  ok,
  json: async () => ({ context }),
});

const emptyContext = { objective: null, targetMonth: null };

describe("StrategyGuidance", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows saved context, asks one question at a time, and explains answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ objective: "Comprar uma casa", targetMonth: "2030-06" }),
        ),
    );
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Renda fixa" }));
    expect(await screen.findByText(/Comprar uma casa/)).toBeTruthy();
    expect(screen.getAllByText(/junho de 2030/)).toHaveLength(2);
    expect(screen.getByText(/Pergunta 1 de 2/)).toBeTruthy();
    expect(screen.queryByText(/Pergunta 2 de 2/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Sim, .*poss.vel/ }));
    expect(screen.getByRole("status").textContent).toMatch(
      /n.o permitem comparar essa condi..o entre classes/i,
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByText(/Pergunta 1 de 2/)).toBeNull();
    expect(screen.getByText(/Pergunta 2 de 2/)).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Prefiro ver menos oscila..es/ }),
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /n.o permite classificar a adequa..o de uma classe inteira/i,
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("heading", {
        name: /O que sabemos sobre as classes escolhidas/,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/o valor pode oscilar/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "CVM: risco e liquidez" }),
    ).toBeTruthy();
  });

  it("keeps deadline wording neutral when the user has not provided a target month", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(emptyContext)));
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(await screen.findByRole("checkbox", { name: "Fundos" }));
    expect(
      await screen.findByText(/acessar esse dinheiro rapidamente/),
    ).toBeTruthy();
    expect(screen.queryByText(/prazo planejado/)).toBeNull();
  });

  it("continues with empty context and explains when the user does not expect to need liquidity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(undefined)));
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(await screen.findByRole("checkbox", { name: "Fundos" }));
    await user.click(
      screen.getByRole("button", { name: "Não espero precisar" }),
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /Ainda assim, prazo e liquidez dependem do instrumento escolhido/i,
    );
  });

  it("shows a loading status while investor context is being fetched", async () => {
    let resolveFetch:
      ((value: ReturnType<typeof response>) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof response>>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Fundos" }));
    expect(screen.getByRole("status").textContent).toMatch(/Carregando/);
    resolveFetch?.(response(emptyContext));
    expect(await screen.findByText(/Pergunta 1 de 2/)).toBeTruthy();
  });

  it("shows a retry action after context loading fails and continues after recovery", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(null, false))
      .mockResolvedValueOnce(response(emptyContext));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: "Fundos" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: /Tentar carregar novamente/ }),
    );
    expect(await screen.findByText(/Pergunta 1 de 2/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps skipped answers optional and passes the selected classes only after explicit confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(emptyContext)));
    const onOpenTargets = vi.fn();
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={onOpenTargets} />);

    await user.click(await screen.findByRole("checkbox", { name: "Fundos" }));
    await user.click(screen.getByRole("checkbox", { name: "Criptoativos" }));
    await user.click(screen.getByRole("button", { name: "Pular por agora" }));
    expect(screen.queryByText(/Pergunta 1 de 2/)).toBeNull();
    expect(screen.getByText(/Pergunta 2 de 2/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pular por agora" }));
    expect(
      screen
        .getByRole("link", { name: "CVM: criptoativos" })
        .getAttribute("href"),
    ).toBe("https://www.gov.br/cvm/pt-br/assuntos/protecao/mercado-forex");
    expect(
      screen.getByText(/A natureza e a regula..o variam conforme o ativo/),
    ).toBeTruthy();
    expect(onOpenTargets).not.toHaveBeenCalled();
    expect(screen.getByText(/refer.ncia manual no editor da #3/)).toBeTruthy();
    expect(
      screen.getByText(/metas atuais ser.o carregadas e preservadas/),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: /Revisar estas classes nas minhas metas/,
      }),
    );
    expect(onOpenTargets).toHaveBeenCalledWith(["Fundos", "Criptoativos"]);
  });

  it("explains that an explicit preference does not classify whole asset classes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(emptyContext)));
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    await user.click(await screen.findByRole("checkbox", { name: "Outros" }));
    await user.click(screen.getByRole("button", { name: "Pular por agora" }));
    await user.click(
      screen.getByRole("button", { name: /Aceito oscila..es no caminho/ }),
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /n.o significa que toda classe ou ativo seja adequado/i,
    );
  });

  it("allows unsure answers and resets the guided questions when the last class is removed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(emptyContext)));
    const user = userEvent.setup();
    render(<StrategyGuidance onOpenTargets={vi.fn()} />);

    const assetClass = screen.getByRole("checkbox", { name: "Renda fixa" });
    await user.click(assetClass);
    const unsureButtons = await screen.findAllByRole("button", {
      name: "Ainda não sei",
    });
    await user.click(unsureButtons[0]);
    expect(unsureButtons[0].getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const preferenceUnsure = screen.getByRole("button", {
      name: "Ainda não sei",
    });
    await user.click(preferenceUnsure);
    expect(screen.getByRole("status").textContent).toMatch(
      /n.o usamos oscila..o para favorecer ou descartar alternativas/i,
    );

    await user.click(assetClass);
    expect(assetClass.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText(/Pergunta [12] de 2/)).toBeNull();
  });
});
