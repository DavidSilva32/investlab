// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    <span role="img" aria-label={alt} className={className} />
  ),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PortfolioChatAssistant } from "@/components/portfolio-chat-assistant";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

function renderAssistant() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PortfolioChatAssistant />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => body,
    headers: { get: () => null },
  });
}

async function revealSuggestions(user: UserEvent) {
  const input = screen.getByRole("textbox", {
    name: "Escreva uma pergunta para o assistente",
  });
  await user.type(input, "Qual é o melhor investimento?");
  await user.keyboard("{Enter}");
  await screen.findByRole("group", { name: "Perguntas rápidas" });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PortfolioChatAssistant", () => {
  it("groups dynamic objective choices by stable purpose and keeps legacy objectives explicit", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: reserveObjectiveId,
              name: "Reserva definida pelo usuário",
              kind: "RESERVE",
              purpose: null,
              targetAmount: null,
              knownValue: 500,
              remainingAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "personal-id",
              name: "Carro",
              kind: "CUSTOM",
              purpose: "PERSONAL_GOAL",
              targetAmount: 1000,
              knownValue: 100,
              remainingAmount: 900,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "long-term-id",
              name: "Horizonte criado pelo usuário",
              kind: "CUSTOM",
              purpose: "LONG_TERM_INVESTMENT",
              targetAmount: null,
              knownValue: 100,
              remainingAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "legacy-id",
              name: "Objetivo antigo",
              kind: "CUSTOM",
              purpose: null,
              targetAmount: null,
              knownValue: 20,
              remainingAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quanto tenho?");
    await user.keyboard("{Enter}");

    const choices = await screen.findByRole("group", {
      name: "Escolha uma categoria e um objetivo",
    });
    expect(
      choices.querySelector('[aria-label="Reserva"]')?.textContent,
    ).toContain("Reserva definida pelo usuário");
    expect(
      choices.querySelector('[aria-label="Objetivos pessoais"]')?.textContent,
    ).toContain("Carro");
    expect(
      choices.querySelector('[aria-label="Investimentos de longo prazo"]')
        ?.textContent,
    ).toContain("Horizonte criado pelo usuário");
    expect(
      choices.querySelector('[aria-label="Objetivos legados sem categoria"]')
        ?.textContent,
    ).toContain("Objetivo antigo");
    expect(choices.textContent).not.toContain("Viagem");

    await user.clear(input);
    await user.type(input, "Carro");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(
        "Ainda não consegui identificar o que você quer consultar. Escolha uma opção ou tente perguntar de outro jeito.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("group", {
        name: "Escolha uma categoria e um objetivo",
      }),
    ).toBeNull();
  });

  it("starts the guided position flow from a direct creation request", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quero cadastrar uma posição manual");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Qual é o nome do ativo ou produto?")).toBeTruthy();
  });

  it("recognizes an investment purchase in everyday wording and asks before creating a manual position", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => jsonResponse({ objectives: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Acabei de comprar mil reais de CDB no Banco Inter",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("heading", {
        name: "Confirme os dados que entendi",
      }),
    ).toBeTruthy();
    expect(screen.getByText("CDB")).toBeTruthy();
    expect(screen.getByText("Banco Inter")).toBeTruthy();
    expect(screen.getByText("Premissa informativa")).toBeTruthy();
    expect(
      screen.getByText("100% do CDI, sem cálculo de rendimento"),
    ).toBeTruthy();
    expect(screen.getByText("Renda fixa")).toBeTruthy();
    expect(screen.getByText("1.000 BRL")).toBeTruthy();
    expect(
      screen.getByText(/não lança uma compra nem uma movimentação/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sim, continuar" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.anything(),
    );
  });

  it("does not start registration when the user says they did not buy an investment", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => jsonResponse({ objectives: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );

    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Não comprei CDB");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/Ainda não consegui identificar/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Confirme os dados que entendi" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.anything(),
    );
  });

  it("asks which action to take when a purchase and consultation are mixed", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() => jsonResponse({ objectives: [] }));
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Comprei CDB e quero ver meu patrimônio",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Entendi um possível cadastro de posição e também uma consulta. Qual dessas ações você quer fazer primeiro? Reformule a pergunta para eu continuar.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Confirme os dados que entendi" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/positions/manual",
      expect.anything(),
    );
  });

  it("discards a partial position draft when the user cancels the guided flow", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Cadastrar posição manual" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
      "Fundo para apagar",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar cadastro" }));
    expect(
      screen.getByRole("button", { name: "Cadastrar posição manual" }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Cadastrar posição manual" }),
    );
    expect(
      await screen.findByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Fundo para apagar")).toBeNull();
  });

  it("recognizes a direct portfolio question without showing suggestions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: {
            knownTotal: 63_171.81,
            missingPositionCount: 1,
            unvaluedPositionCount: 2,
          },
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Qual é o meu patrimônio hoje?");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/Seu patrimônio conhecido é R\$ 63\.171,81/),
    ).toBeTruthy();
    expect(screen.getByText(/3 posições sem valor confirmado/)).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Perguntas rápidas" }),
    ).toBeNull();
  });

  it("answers a quick portfolio-total choice when objective data has already loaded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: { knownTotal: 63_171.81 },
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", {
        name: "Quanto tenho de patrimônio conhecido?",
      }),
    );

    expect(
      await screen.findByText(/Seu patrimônio conhecido é R\$ 63\.171,81/),
    ).toBeTruthy();
  });

  it("retries a quick portfolio-total choice when objective data has not loaded", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => jsonResponse({ message: "Falha" }, false))
        .mockImplementationOnce(() =>
          jsonResponse({
            objectives: [],
            destinationSummary: { knownTotal: 63_171.81 },
          }),
        ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", {
        name: "Quanto tenho de patrimônio conhecido?",
      }),
    );

    expect(
      await screen.findByText(/Seu patrimônio conhecido é R\$ 63\.171,81/),
    ).toBeTruthy();
  });

  it("shows a short relevant suggestion list after a partially recognized question", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "quanto tenho e quanto falta?");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Posso ter entendido uma destas possibilidades. Escolha a mais próxima ou reformule sua pergunta.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Quero simular um plano" }),
    ).toBeNull();
  });

  it("explains when the portfolio total is missing from an incomplete response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [], destinationSummary: null })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Qual é o patrimônio total da carteira?",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Não encontrei um valor de patrimônio conhecido para consultar agora.",
      ),
    ).toBeTruthy();
  });

  it("describes a single portfolio position without a confirmed value", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: {
            knownTotal: 63_171.81,
            missingPositionCount: 1,
            unvaluedPositionCount: 0,
          },
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Qual é o patrimônio total da carteira?",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/1 posição sem valor confirmado/),
    ).toBeTruthy();
  });

  it("ignores invalid counts when describing the known portfolio total", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: {
            knownTotal: 63_171.81,
            missingPositionCount: Number.POSITIVE_INFINITY,
            unvaluedPositionCount: Number.POSITIVE_INFINITY,
          },
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Qual é o patrimônio total da carteira?",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(/Seu patrimônio conhecido é R\$ 63\.171,81/),
    ).toBeTruthy();
    expect(screen.queryByText(/posições sem valor confirmado/)).toBeNull();
  });

  it("answers a named objective contribution question directly", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              monthlyPlannedAmount: 1_250,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quanto planejei aportar por mês na Viagem?",
    );
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Viagem" }));

    expect(
      await screen.findByText(/aporte mensal planejado de R\$ 1\.250,00/),
    ).toBeTruthy();
  });

  it("answers monthly planned contribution questions and marks missing values as optional intentions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              monthlyPlannedAmount: 1_250,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "house",
              name: "Casa nova",
              targetAmount: 500_000,
              knownValue: 80_000,
              remainingAmount: 420_000,
              monthlyPlannedAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", {
        name: "Quanto planejei aportar por mês?",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Viagem" }));

    expect(
      await screen.findByText(
        /aporte mensal planejado de R\$ 1\.250,00 para Viagem/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/não um aporte realizado nem uma obrigação/),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Fazer outra pergunta" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", {
        name: "Quanto planejei aportar por mês?",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Casa nova" }));

    expect(
      await screen.findByText(
        /Não há aporte mensal planejado registrado para Casa nova/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /intenção pessoal, não um aporte realizado nem uma obrigação/,
      ),
    ).toBeTruthy();
  });

  it("opens an accessible guided chat and answers from a selected objective", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "long-term",
              name: "Longo prazo",
              targetAmount: 100_000,
              knownValue: 25_500,
              remainingAmount: 74_500,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    const launcher = screen.getByRole("button", {
      name: "Abrir assistente da carteira",
    });
    expect(launcher.querySelector('[role="img"]')).toBeTruthy();
    await user.click(launcher);
    expect(launcher.getAttribute("aria-hidden")).toBe("true");
    expect(launcher.className).toContain("opacity-0");

    expect(
      screen.getByRole("dialog", { name: "Assistente da carteira" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Mascote do assistente" }),
    ).toBeTruthy();
    const conversation = screen.getByRole("log", {
      name: "Conversa com o assistente",
    });
    expect(conversation.querySelector("button")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cadastrar posição manual" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Perguntas rápidas" }),
    ).toBeNull();
    expect(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }).parentElement?.parentElement?.textContent,
    ).not.toContain("Quanto tenho em um objetivo?");
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Longo prazo" }),
    );

    expect(
      await screen.findByText(
        /O valor conhecido em Longo prazo é R\$ 25\.500,00/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Planejar esta meta/ })
        .getAttribute("href"),
    ).toBe("/planning?objective=long-term");
  });

  it("closes the conversation from its close button and ignores blank submissions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    const launcher = screen.getByRole("button", {
      name: "Abrir assistente da carteira",
    });
    await user.click(launcher);
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByRole("log").textContent).toContain(
      "Oi! Posso consultar seus objetivos",
    );
    expect(screen.getByRole("log").textContent).not.toContain(
      "Ainda não entendi",
    );

    await user.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(
      screen.queryByRole("dialog", { name: "Assistente da carteira" }),
    ).toBeNull();
    expect(launcher.getAttribute("aria-hidden")).toBe("false");
    expect(launcher.className).toContain("opacity-100");
  });

  it("offers the guided choices when the first question is outside its supported topics", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Qual é o melhor investimento?");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Ainda não consegui identificar o que você quer consultar. Escolha uma opção ou tente perguntar de outro jeito.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Não consegui relacionar/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    ).toBeTruthy();
  });

  it("shows only relevant suggestions for a mixed objective question", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "quanto tenho e quanto falta para a viagem");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Posso ter entendido uma destas possibilidades. Escolha a mais próxima ou reformule sua pergunta.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "Quanto tenho de patrimônio conhecido?",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Quero simular um plano" }),
    ).toBeNull();
    expect(screen.queryByText(/O valor conhecido em Viagem é/)).toBeNull();
    expect(screen.queryByText(/faltam R\$/)).toBeNull();
  });

  it("renders long messages in the message scroller with wrapping enabled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );

    const longMessage = `${"Quero entender meu patrimônio e meus objetivos. ".repeat(12)}${"semseparadores".repeat(10)}`;
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    fireEvent.change(input, { target: { value: longMessage } });
    fireEvent.submit(input.closest("form")!);

    expect(
      screen.getByRole("log", { name: "Conversa com o assistente" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Conversa com o assistente" }),
    ).toBeTruthy();
    expect(screen.getByText(longMessage).className).toContain(
      "whitespace-pre-wrap",
    );
    expect(screen.getByText(longMessage).className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(
      screen
        .getByText(longMessage)
        .closest('[data-slot="message-scroller-item"]'),
    ).toBeTruthy();
  });

  it("accepts a typed question with synonyms and answers a uniquely named objective", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    const sendButton = screen.getByRole("button", { name: "Enviar mensagem" });
    expect(sendButton.hasAttribute("disabled")).toBe(true);
    await user.type(input, "QUAL SALDO conhecido da viagem?");
    expect(sendButton.hasAttribute("disabled")).toBe(false);
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Viagem" }));

    expect(
      await screen.findByText(/O valor conhecido em Viagem é R\$ 12\.000,00/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("group", {
        name: "Escolha uma categoria e um objetivo",
      }),
    ).toBe(null);
  });

  it("resolves an explicit planning objective after the objectives query finishes", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quero simular um plano para objetivos pessoais");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText("Carregando seus objetivos..."),
    ).toBeTruthy();
    expect(screen.getByRole("log").textContent).toContain(
      "Quero simular um plano para objetivos pessoais",
    );
    expect(
      screen.queryByRole("link", { name: "Abrir planejamento" }),
    ).toBeNull();

    await act(async () => {
      resolveRequest(
        await jsonResponse({
          objectives: [
            {
              id: "travel",
              kind: "PERSONAL_GOAL",
              purpose: "PERSONAL_GOAL",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      );
    });

    const planningLink = await screen.findByRole("link", {
      name: "Abrir planejamento",
    });
    expect(planningLink.getAttribute("href")).toBe(
      "/planning?objective=travel",
    );
    expect(screen.getByRole("log").textContent).toContain("Viagem selecionado");
  });

  it("handles a successful objectives response with no objectives array", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quanto falta para minha meta?",
    );
    await user.keyboard("{Enter}");
    await act(async () => {
      resolveRequest(await jsonResponse({}));
    });

    expect(
      await screen.findByText("Você ainda não tem objetivos cadastrados."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ver objetivos/ }).getAttribute("href"),
    ).toBe("/portfolio?panel=objectives");
  });

  it("preserves a pending planning request through a load error and retry", async () => {
    const user = userEvent.setup();
    let rejectRequest!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
            rejectRequest = resolve;
          }),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              kind: "PERSONAL_GOAL",
              purpose: "PERSONAL_GOAL",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Planejar Viagem",
    );
    await user.keyboard("{Enter}");
    await act(async () => {
      rejectRequest(await jsonResponse({ message: "Falha" }, false));
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("log").textContent).toContain("Planejar Viagem");
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByRole("link", { name: "Abrir planejamento" }),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("answers typed gap questions and explains incomplete values without inventing a balance", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 1,
              unvaluedPositionCount: 0,
            },
            {
              id: "house",
              name: "Casa nova",
              targetAmount: 500_000,
              knownValue: null,
              remainingAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 1,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Falta quanto?");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Viagem" }));
    expect(
      await screen.findByText(/faltam R\$ 4\.000,00 para a meta/),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 posição\(ões\) sem valor confirmado/),
    ).toBeTruthy();

    await user.type(input, "Quanto falta?");
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("button", { name: "Casa nova" }));
    expect(
      await screen.findByText(
        /Ainda não consigo calcular quanto falta para Casa nova/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/porque há posições sem valor confirmado\.$/),
    ).toBeTruthy();
  });

  it("asks the user to choose when the objective is not explicit and keeps quick options after unknown text", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "house",
              name: "Casa nova",
              targetAmount: 500_000,
              knownValue: 80_000,
              remainingAmount: 420_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quanto falta para minha meta?");
    await user.keyboard("{Enter}");

    const objectiveChoices = await screen.findByRole("group", {
      name: "Escolha uma categoria e um objetivo",
    });
    expect(objectiveChoices.closest('[role="log"]')).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Viagem" })).toBeTruthy();

    await user.type(input, "Quanto falta para Viagem e Casa nova?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findAllByText("Qual objetivo você quer consultar?"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("group", {
        name: "Escolha uma categoria e um objetivo",
      }),
    ).toBeTruthy();

    await user.clear(input);
    await user.type(input, "qual é o melhor investimento?");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Ainda não consegui identificar o que você quer consultar. Escolha uma opção ou tente perguntar de outro jeito.",
      ),
    ).toBeTruthy();
    const quickPrompt = screen.getByRole("button", {
      name: "Quanto tenho em um objetivo?",
    });
    expect(quickPrompt.closest('[role="log"]')).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Quero simular um plano" }),
    ).toBeTruthy();
  });

  it("opens planning with a recognized objective", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel trip",
              purpose: "PERSONAL_GOAL",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quero simular um plano para objetivos pessoais",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("link", { name: /Abrir planejamento/ }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Abrir planejamento/ })
        .getAttribute("href"),
    ).toBe("/planning?objective=travel%20trip");
  });

  it("opens general planning when a planning request has no objective name", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quero simular um plano",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        "Posso abrir o planejamento para você explorar um cenário.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Abrir planejamento" })
        .getAttribute("href"),
    ).toBe("/planning");
  });

  it("recognizes conversational balance questions for travel and reserve objectives", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "00000000-0000-4000-8000-000000000010",
              kind: "RESERVE",
              name: "Reserva de emergência",
              targetAmount: 30_000,
              knownValue: 12_000,
              remainingAmount: 18_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "travel",
              kind: "PERSONAL_GOAL",
              purpose: "PERSONAL_GOAL",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 9_000,
              remainingAmount: 7_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "long-term",
              kind: "CUSTOM",
              purpose: "LONG_TERM_INVESTMENT",
              name: "Longo prazo",
              targetAmount: 50_000,
              knownValue: 8_000,
              remainingAmount: 42_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });

    await user.type(input, "Quanto de viagem?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText("Qual objetivo você quer consultar?"),
    ).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: "Viagem" }));
    expect(
      await screen.findByText(/O valor conhecido em Viagem é R\$ 9\.000,00/),
    ).toBeTruthy();

    await user.type(input, "Quanto de reserva?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(
        /O valor conhecido em Reserva de emergência é R\$ 12\.000,00/,
      ),
    ).toBeTruthy();
    await user.type(input, "Quanto de longo prazo?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(
        /O valor conhecido em Longo prazo é R\$ 8\.000,00/,
      ),
    ).toBeTruthy();
  });

  it("keeps the reserve available for balance and gap questions but never links it as a planning objective", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "00000000-0000-4000-8000-000000000010",
              kind: "RESERVE",
              name: "Reserva de emergência",
              targetAmount: 30_000,
              knownValue: 12_000,
              remainingAmount: 18_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "travel",
              kind: "PERSONAL_GOAL",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quero simular um plano para reserva de emergência");
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        /A reserva não pode ser simulada como objetivo individual/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Abrir planejamento" })
        .getAttribute("href"),
    ).toBe("/planning");
    expect(
      screen.queryByRole("link", { name: "Planejar esta meta" }),
    ).toBeNull();

    await user.type(input, "Quanto falta para reserva de emergência?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(/faltam R\$ 18\.000,00 para a meta/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Planejar esta meta" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Fazer outra pergunta" }),
    ).toBeTruthy();

    await user.type(input, "Qual o valor da reserva de emergencia?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(
        /O valor conhecido em Reserva de emergência é R\$ 12\.000,00/,
      ),
    ).toBeTruthy();

    await user.type(
      input,
      "Quero simular um plano para reserva de emergência e Viagem",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText("Qual objetivo você quer planejar?"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Viagem" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Reserva de emergência" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Viagem" }));
    expect(
      screen
        .getByRole("link", { name: "Abrir planejamento" })
        .getAttribute("href"),
    ).toBe("/planning?objective=travel");
  });

  it("offers total planning when ambiguous matches contain no individually plannable objectives", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "00000000-0000-4000-8000-000000000010",
              kind: "RESERVE",
              name: "Reserva",
              targetAmount: 30_000,
              knownValue: 12_000,
              remainingAmount: 18_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "other-reserve",
              kind: "RESERVE",
              name: "Fundo de emergência",
              targetAmount: 40_000,
              knownValue: 12_000,
              remainingAmount: 28_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quero simular Reserva e Fundo de emergência",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        /Não há objetivos disponíveis para esse planejamento/,
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Planejar patrimônio total/ })
        .getAttribute("href"),
    ).toBe("/planning");
    expect(screen.queryByRole("button", { name: "Reserva" })).toBeNull();
  });

  it("shows a loading status while objective data is pending", async () => {
    const user = userEvent.setup();
    let resolveRequest!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    );
    expect(
      await screen.findByText("Carregando seus objetivos..."),
    ).toBeTruthy();

    await act(async () => {
      resolveRequest(
        await jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      );
    });

    expect(await screen.findByRole("button", { name: "Viagem" })).toBeTruthy();
  });

  it("allows retrying when objectives cannot load", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ message: "Falha" }, false))
      .mockImplementationOnce(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: 4_000,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await user.click(await screen.findByRole("button", { name: "Viagem" }));

    expect(
      await screen.findByText(
        /faltam R\$ 4\.000,00 para a meta de R\$ 16\.000,00/,
      ),
    ).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("explains when the requested objective value is incomplete", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              targetAmount: 16_000,
              knownValue: 12_000,
              remainingAmount: null,
              missingPositionCount: 1,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Viagem" }));

    await waitFor(() => {
      expect(
        screen.getByText(/não consigo calcular quanto falta para Viagem/),
      ).toBeTruthy();
    });
    expect(
      screen.getByText(/valor conhecido hoje é R\$ 12\.000,00/),
    ).toBeTruthy();
  });

  it("offers a route to configure objectives when there are none", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    );

    expect(
      await screen.findByText("Você ainda não tem objetivos cadastrados."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Ver objetivos/ }).getAttribute("href"),
    ).toBe("/portfolio?panel=objectives");
  });

  it("distinguishes missing values, missing targets, and an already reached goal", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "missing-value",
              name: "Sem saldo",
              targetAmount: null,
              knownValue: null,
              remainingAmount: null,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
            {
              id: "incomplete-value",
              name: "Parcial",
              targetAmount: null,
              knownValue: 500,
              remainingAmount: null,
              missingPositionCount: 1,
              unvaluedPositionCount: 0,
            },
            {
              id: "reached",
              name: "Reserva",
              targetAmount: 1_000,
              knownValue: 1_000,
              remainingAmount: 0,
              missingPositionCount: 0,
              unvaluedPositionCount: 0,
            },
          ],
        }),
      ),
    );

    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Sem saldo" }));
    expect(
      await screen.findByText(
        /Não encontrei um saldo conhecido para Sem saldo/,
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Fazer outra pergunta" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto tenho em um objetivo?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Parcial" }));
    expect(
      await screen.findByText(/O valor conhecido em Parcial é R\$ 500,00/),
    ).toBeTruthy();
    expect(
      screen.getByText(/1 posição\(ões\) sem valor confirmado/),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Fazer outra pergunta" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Sem saldo" }));
    expect(
      await screen.findByText(/Sem saldo ainda não tem uma meta definida/),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Fazer outra pergunta" }),
    );
    await revealSuggestions(user);
    await user.click(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Reserva" }));
    expect(
      await screen.findByText(/Reserva já atingiu a meta de R\$ 1\.000,00/),
    ).toBeTruthy();
  });
});
