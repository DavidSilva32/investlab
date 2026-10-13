// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { PortfolioChatManualPosition } from "@/components/portfolio-chat-manual-position";

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

function renderFlow(onBack = vi.fn()) {
  return { onBack, ...render(<PortfolioChatManualPosition onBack={onBack} />) };
}

async function reachSummary(
  user: ReturnType<typeof userEvent.setup>,
  currency = "BRL",
  includeConversion = false,
) {
  const answer = async (text: string) => {
    const input = screen.getByRole("textbox", {
      name: "Resposta para o cadastro da posição",
    });
    await user.clear(input);
    await user.type(input, text);
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));
  };
  await answer("Fundo de exemplo");
  await user.click(screen.getByRole("button", { name: "Renda fixa" }));
  await answer("2,5");
  await answer(currency);
  await user.click(screen.getByRole("button", { name: "Valor total" }));
  await answer("1.250,75");
  await answer("13/10/2026");
  if (currency !== "BRL") {
    await user.click(
      screen.getByRole("button", {
        name: includeConversion
          ? "Informar valor e data"
          : "Sem conversão informada",
      }),
    );
  }
  if (includeConversion) {
    await answer("6.500,00");
    await answer("12/10/2026");
  }
  expect(
    await screen.findByRole("heading", { name: "Resumo da posição manual" }),
  ).toBeTruthy();
  return answer;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PortfolioChatManualPosition", () => {
  it("confirms a parsed purchase, keeps it as a manual position, and asks only missing fields", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => jsonResponse({ position: { id: "new" } }));
    vi.stubGlobal("fetch", fetchMock);
    const initialRequest = {
      product: "CDB",
      institution: "Banco Inter",
      assetClass: "Renda fixa" as const,
      amount: 1000,
      currency: "BRL" as const,
      valueBasis: "total_value" as const,
      informationalCdiPercentage: 100,
    };
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={initialRequest}
      />,
    );

    expect(screen.getByText("CDB")).toBeTruthy();
    expect(screen.getByText("Banco Inter")).toBeTruthy();
    expect(screen.getByText("Premissa informativa")).toBeTruthy();
    expect(
      screen.getByText("100% do CDI, sem cálculo de rendimento"),
    ).toBeTruthy();
    expect(screen.getByText("1.000 BRL")).toBeTruthy();
    expect(
      screen.getByText(/não lança uma compra nem uma movimentação/),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sim, continuar" }));
    expect(
      await screen.findByText(
        "Qual quantidade você quer registrar? Informe o número exato.",
      ),
    ).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
      "1",
    );
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(
      await screen.findByText(
        "Qual é a data-base desse valor? Informe DD/MM/AAAA ou AAAA-MM-DD.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Qual é a moeda do valor informado? Digite o código, como BRL, USD ou EUR.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        "O valor que você vai informar é o total da posição ou o preço por unidade?",
      ),
    ).toBeNull();
    expect(
      screen.queryByText(
        "Qual é o valor? Use vírgula ou ponto para os centavos.",
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a proposed registration without creating a position", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onCancel = vi.fn();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        onCancel={onCancel}
        initialRequest={{
          product: "CDB",
          institution: "Banco Inter",
          informationalCdiPercentage: 100,
          assetClass: "Renda fixa",
          amount: 1000,
          currency: "BRL",
          valueBasis: "total_value",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns to correction from the summary without saving", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    await reachSummary(user);

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("updates only the value when a correction includes a clear amount", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: "CDB",
          institution: null,
          assetClass: "Renda fixa",
          amount: 1000,
          currency: "BRL",
          valueBasis: "total_value",
          informationalCdiPercentage: 100,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));
    await user.type(screen.getByRole("textbox"), "R$ 2.000,00");
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(screen.getByText("2.000 BRL")).toBeTruthy();
  });

  it("keeps the original product when a correction repeats its class label", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: "CDB",
          institution: null,
          assetClass: "Renda fixa",
          amount: 1000,
          currency: "BRL",
          valueBasis: "total_value",
          informationalCdiPercentage: 100,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));
    await user.type(screen.getByRole("textbox"), "na verdade CDB");
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(screen.getByText("Premissa informativa")).toBeTruthy();
    expect(
      screen.getByText("100% do CDI, sem cálculo de rendimento"),
    ).toBeTruthy();
  });

  it("asks for missing product and class in an inferred request", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: null,
          institution: null,
          assetClass: null,
          amount: null,
          currency: null,
          valueBasis: null,
          informationalCdiPercentage: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sim, continuar" }));
    expect(screen.getByText("Qual é o nome do ativo ou produto?")).toBeTruthy();
    await user.type(screen.getByRole("textbox"), "na verdade CDB");
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(
      screen.getByText("Selecione a classe informada para essa posição."),
    ).toBeTruthy();
  });

  it("asks for a missing class when the inferred request already has a product", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: "CDB",
          institution: null,
          assetClass: null,
          amount: null,
          currency: null,
          valueBasis: null,
          informationalCdiPercentage: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sim, continuar" }));

    expect(
      screen.getByText("Selecione a classe informada para essa posição."),
    ).toBeTruthy();
  });

  it("keeps a broad product correction without assigning a specific subclass", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: "CDB",
          institution: null,
          assetClass: "Renda fixa",
          amount: 1000,
          currency: "BRL",
          valueBasis: "total_value",
          informationalCdiPercentage: 100,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));
    await user.type(screen.getByRole("textbox"), "Tesouro R$ 2.000");
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(screen.getAllByText(/Tesouro/)).toHaveLength(2);
    expect(screen.queryByText("Premissa informativa")).toBeNull();
  });

  it("ignores an empty answer", () => {
    renderFlow();
    const form = screen.getByRole("textbox").closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(screen.getByRole("log").children).toHaveLength(1);
  });

  it("clears the CDI premise when a CDB correction changes the product to LCI", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioChatManualPosition
        onBack={vi.fn()}
        initialRequest={{
          product: "CDB",
          institution: "Banco Inter",
          assetClass: "Renda fixa",
          amount: 1000,
          currency: "BRL",
          valueBasis: "total_value",
          informationalCdiPercentage: 100,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Corrigir dados" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
      "na verdade LCI",
    );
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));

    expect(screen.getByText("LCI")).toBeTruthy();
    expect(screen.queryByText("Premissa informativa")).toBeNull();
  });

  it("collects explicit fields and waits for confirmation before the canonical manual POST", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse({ message: "Dados da posição recusados." }, false),
      )
      .mockImplementationOnce(() => jsonResponse({ position: { id: "new" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();

    await reachSummary(user);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("1.250,75 BRL")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.objectContaining({ method: "POST" }),
    );
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request).toEqual({
      product: "Fundo de exemplo",
      institution: null,
      informationalCdiPercentage: null,
      assetClass: "Renda fixa",
      subClass: null,
      geography: null,
      quantity: 2.5,
      currency: "BRL",
      valueBasis: "total_value",
      unitPrice: null,
      totalValue: 1250.75,
      positionDate: "2026-10-13",
      convertedValueBrl: null,
      conversionDate: null,
    });
    expect(toastError).toHaveBeenCalledWith("Dados da posição recusados.");
    expect(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );
    await screen.findByText(
      "Posição criada como registro manual. Os dados da carteira serão atualizados.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalledWith("Posição adicionada.");
  });

  it("requires an explicit conversion value and date for foreign currency when the user has them", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string, _request?: RequestInit) =>
      jsonResponse({ position: { id: "new" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderFlow();
    await reachSummary(user, "EUR", true);

    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );
    await screen.findByText(
      "Posição criada como registro manual. Os dados da carteira serão atualizados.",
    );
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request.currency).toBe("EUR");
    expect(request.convertedValueBrl).toBe(6500);
    expect(request.conversionDate).toBe("2026-10-12");
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:updated" }),
    );
  });

  it("allows saving a foreign currency position when the user explicitly has no conversion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_url: string, _request?: RequestInit) =>
      jsonResponse({ position: { id: "new" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    renderFlow();
    await reachSummary(user, "USD");
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );

    await screen.findByText(
      "Posição criada como registro manual. Os dados da carteira serão atualizados.",
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "portfolio:updated" }),
    );
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request.currency).toBe("USD");
    expect(request.convertedValueBrl).toBeNull();
  });

  it("keeps blank answers disabled and submits a unit price as unitPrice", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ position: { id: "new" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();

    const input = screen.getByRole("textbox", {
      name: /Resposta para o cadastro da posi/,
    });
    const submit = screen.getByRole("button", { name: "Enviar resposta" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "   " } });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "" } });

    const answer = async (text: string) => {
      const currentInput = screen.getByRole("textbox", {
        name: /Resposta para o cadastro da posi/,
      });
      fireEvent.change(currentInput, { target: { value: text } });
      fireEvent.click(screen.getByRole("button", { name: "Enviar resposta" }));
    };
    await answer("ETF exemplo");
    await user.click(screen.getByRole("button", { name: "Renda fixa" }));
    await answer("2");
    await answer("BRL");
    await user.click(
      screen
        .getByRole("group", { name: "Base do valor" })
        .querySelectorAll("button")[1]!,
    );
    await answer("42,75");
    await answer("13/10/2026");
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request).toMatchObject({
      valueBasis: "unit_price",
      unitPrice: 42.75,
      totalValue: null,
    });
  });

  it("does not send invalid quantities and lets the user retry with a valid value", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => jsonResponse({ position: { id: "new" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { onBack } = renderFlow();

    const answer = async (text: string) => {
      const input = screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      });
      await user.clear(input);
      await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Enviar resposta" }));
    };
    await answer("Fundo de exemplo");
    await user.click(screen.getByRole("button", { name: "Renda fixa" }));
    await answer("0");
    expect(
      await screen.findByText(
        "Não consegui validar essa quantidade. Informe um número maior que zero.",
      ),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await answer("2");
    expect(
      await screen.findByText(
        "Qual é a moeda do valor informado? Digite o código, como BRL, USD ou EUR.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar cadastro" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks again when product, currency, value, or valuation date is invalid", async () => {
    const user = userEvent.setup();
    renderFlow();
    const answer = async (text: string) => {
      const input = screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      });
      await user.clear(input);
      await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Enviar resposta" }));
    };

    const productInput = screen.getByRole("textbox", {
      name: "Resposta para o cadastro da posição",
    });
    fireEvent.change(productInput, { target: { value: "A".repeat(161) } });
    await user.click(screen.getByRole("button", { name: "Enviar resposta" }));
    expect(
      await screen.findByText(
        "O nome pode ter até 160 caracteres. Informe novamente.",
      ),
    ).toBeTruthy();
    await answer("ETF exemplo");
    await user.click(screen.getByRole("button", { name: "Renda fixa" }));
    await answer("2");
    await answer("Reais");
    expect(
      await screen.findByText(
        "Informe o código de moeda com três letras, como BRL, USD ou EUR.",
      ),
    ).toBeTruthy();
    await answer("BRL");
    await user.click(screen.getByRole("button", { name: "Preço por unidade" }));
    await answer("não sei");
    expect(
      await screen.findByText(
        "Não consegui validar esse valor. Informe um número maior que zero.",
      ),
    ).toBeTruthy();
    await answer("42,75");
    await answer("31/02/2026");
    expect(
      await screen.findByText(
        "Não consegui validar a data. Use DD/MM/AAAA ou AAAA-MM-DD.",
      ),
    ).toBeTruthy();
    await answer("13/10/2026");
    expect(
      await screen.findByRole("heading", { name: "Resumo da posição manual" }),
    ).toBeTruthy();
  });

  it("validates foreign conversion values and dates before showing them in the summary", async () => {
    const user = userEvent.setup();
    renderFlow();
    const answer = async (text: string) => {
      const input = screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      });
      await user.clear(input);
      await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Enviar resposta" }));
    };
    await answer("ETF exemplo");
    await user.click(screen.getByRole("button", { name: "Renda fixa" }));
    await answer("1");
    await answer("USD");
    await user.click(screen.getByRole("button", { name: "Valor total" }));
    await answer("100");
    await answer("2026-10-13");
    await user.click(
      screen.getByRole("button", { name: "Informar valor e data" }),
    );
    await answer("0");
    expect(
      await screen.findByText(
        "Não consegui validar esse valor convertido. Informe um número maior que zero.",
      ),
    ).toBeTruthy();
    await answer("500");
    await answer("ontem");
    expect(
      await screen.findByText(
        "Não consegui validar a data. Use DD/MM/AAAA ou AAAA-MM-DD.",
      ),
    ).toBeTruthy();
    await answer("2026-10-12");
    expect(
      await screen.findByRole("heading", { name: "Resumo da posição manual" }),
    ).toBeTruthy();
    expect(screen.getByText("R$ 500,00")).toBeTruthy();
  });

  it("shows a fixed safe message after a network error and preserves the summary for retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn((_url: string, _request?: RequestInit) =>
        jsonResponse({ position: { id: "new" } }),
      )
      .mockRejectedValueOnce(new Error("private network diagnostic"));
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    await reachSummary(user);
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Não foi possível salvar a posição.",
      ),
    );
    expect(screen.getAllByText("Fundo de exemplo")).toHaveLength(2);
    expect(screen.queryByText("private network diagnostic")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Confirmar cadastro" }),
    );
    await screen.findByText(
      "Posição criada como registro manual. Os dados da carteira serão atualizados.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels from the summary without creating a record", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { onBack } = renderFlow();
    await reachSummary(user);
    await user.click(screen.getByRole("button", { name: "Cancelar cadastro" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks duplicate confirmation while one create request is pending", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (value: {
      ok: boolean;
      json: () => Promise<unknown>;
    }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<unknown> }>(
          (resolve) => (resolveRequest = resolve),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderFlow();
    await reachSummary(user);
    const confirm = screen.getByRole("button", { name: "Confirmar cadastro" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRequest({
      ok: true,
      json: async () => ({ position: { id: "new" } }),
    });
    await screen.findByText(
      "Posição criada como registro manual. Os dados da carteira serão atualizados.",
    );
  });
});
