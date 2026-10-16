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
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...props}>{children}</div>
  ),
  ChartTooltip: ({ content }: { content: React.ReactNode }) => <>{content}</>,
  ChartTooltipContent: () => <span />,
}));
vi.mock("recharts", () => ({
  Cell: ({ fill }: { fill: string }) => <span data-fill={fill} />,
  Pie: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PieChart: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/components/portfolio-chat-microphone", async () => {
  const { forwardRef, useImperativeHandle, useState } = await import("react");
  return {
    PortfolioChatMicrophone: forwardRef<
      { finalizeAndSubmit: () => void },
      {
        onTranscript: (transcript: string) => void;
        onSubmitTranscript: (transcript: string) => void;
        onRecordingChange: (recording: boolean) => void;
      }
    >(function MockPortfolioChatMicrophone(
      { onTranscript, onSubmitTranscript, onRecordingChange },
      ref,
    ) {
      const [active, setActive] = useState(false);
      const [recognizedText, setRecognizedText] = useState("texto reconhecido");
      useImperativeHandle(
        ref,
        () => ({
          finalizeAndSubmit() {
            setActive(false);
            onRecordingChange(false);
            onSubmitTranscript(recognizedText);
          },
        }),
        [recognizedText, onRecordingChange, onSubmitTranscript],
      );
      return (
        <>
          <button
            type="button"
            onClick={() => onTranscript("texto reconhecido")}
          >
            Simular audio
          </button>
          <button
            type="button"
            onClick={() => {
              setRecognizedText("texto reconhecido");
              setActive(true);
              onRecordingChange(true);
            }}
          >
            Simular gravação ativa
          </button>
          <button
            type="button"
            onClick={() => {
              setRecognizedText("");
              setActive(true);
              onRecordingChange(true);
            }}
          >
            Simular gravação sem fala
          </button>
          {active && <span>Gravando</span>}
        </>
      );
    }),
  };
});

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

function equityPosition(
  id: string,
  issuer: string,
  canonicalValueCents: string | null,
  totalValue: string | null = null,
) {
  return {
    id,
    product: "Ação ordinária",
    assetCode: id.toUpperCase(),
    issuer,
    institution: null,
    totalValue,
    canonicalValueCents,
    classification: {
      assetClass: "Renda variável",
      subClass: "Ação ordinária",
      geography: "Brasil",
    },
  };
}

async function revealSuggestions(user: UserEvent) {
  const input = screen.getByRole("textbox", {
    name: "Escreva uma pergunta para o assistente",
  });
  await user.type(input, "Qual é o melhor investimento?");
  await user.keyboard("{Enter}");
  await screen.findByRole("group", { name: "Perguntas rápidas" });
}

async function askQuestion(user: UserEvent, question: string) {
  await user.type(
    screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    }),
    question,
  );
  await user.keyboard("{Enter}");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PortfolioChatAssistant", () => {
  it("offers compact current portfolio and class queries as opening actions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );

    const quickPrompts = screen.getByRole("group", {
      name: "Consultas rápidas",
    });
    const quickPrompt = screen.getByRole("button", { name: "Patrimônio" });
    expect(quickPrompts.closest('[data-slot="message-scroller"]')).toBeTruthy();
    expect(
      quickPrompts.closest('[data-slot="message-scroller-viewport"]'),
    ).toBeTruthy();
    expect(
      quickPrompts.closest('[data-slot="message-scroller-content"]'),
    ).toBeTruthy();
    expect(quickPrompts.closest('[role="log"]')).toBeTruthy();
    expect(
      quickPrompts.closest('[data-slot="message-scroller-item"]')?.className,
    ).toContain("mt-auto");
    expect(quickPrompts.closest("form")).toBeNull();
    expect(quickPrompts.className).toContain("flex-wrap");
    expect(quickPrompts.parentElement?.className).not.toContain("border-t");
    expect(quickPrompt.className).toContain("hover:-translate-y-0.5");
    expect(quickPrompt.className).toContain("focus-visible:ring-2");
    expect(quickPrompt.className).toContain("active:scale-[0.98]");
    expect(quickPrompt.className).toContain("motion-reduce:transition-none");
    expect(screen.getByRole("button", { name: "FIIs" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Ações na carteira" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "FIIs na carteira" }),
    ).toBeNull();
  });

  it("keeps the message field flexible while composer controls retain their size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ objectives: [] })),
    );
    renderAssistant();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Abrir assistente da carteira" }),
      );

    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    const form = input.closest("form");

    expect(form?.className).toContain("min-w-0");
    expect(input.className).toContain("flex-1");
    expect(
      form?.querySelector('[aria-label="Enviar mensagem"]')?.className,
    ).toContain("shrink-0");
  });

  it("answers the opening portfolio shortcut from the current summary", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      jsonResponse({
        objectives: [],
        destinationSummary: { knownTotal: 123.45 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.click(screen.getByRole("button", { name: "Patrimônio" }));

    expect(await screen.findByText(/R\$ 123,45/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("answers a class query from the quick action chips", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("/api/portfolio/chat/query")
        ? jsonResponse({ message: "Valor acompanhado em FIIs: R$ 100,00." })
        : jsonResponse({ objectives: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await user.click(screen.getByRole("button", { name: "FIIs" }));

    expect(await screen.findByText(/Valor acompanhado em FIIs/)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/portfolio/chat/query"),
      ),
    ).toBe(true);
  });

  it("answers a quick class query while objective data is still loading", async () => {
    const user = userEvent.setup();
    let resolveObjectives!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({ message: "Valor de FIIs consultado." })
          : new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
              resolveObjectives = resolve;
            }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await screen.findByRole("group", { name: "Consultas rápidas" });
    await user.click(screen.getByRole("button", { name: "FIIs" }));

    expect(await screen.findByText("Valor de FIIs consultado.")).toBeTruthy();
    await act(async () =>
      resolveObjectives(await jsonResponse({ objectives: [] })),
    );
  });

  it("holds the opening portfolio shortcut through an objectives error and retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ message: "Falha" }, false))
      .mockImplementationOnce(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: { knownTotal: 234.56 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Patrimônio" }));

    expect(await screen.findByText(/R\$ 234,56/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists current equities using the portfolio chat query endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return String(input).includes("/api/portfolio/chat/query")
        ? jsonResponse({
            message: "Encontrei 1 posição(ões) em Ações e BDRs.",
            items: [
              {
                id: "itub4",
                product: "Ação preferencial",
                assetCode: "ITUB4",
                issuer: "Itaú Unibanco",
                institution: null,
                valueCents: "12345",
              },
            ],
          })
        : jsonResponse({ objectives: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais ações estão na carteira?");
    expect(
      await screen.findByText("Encontrei 1 posição(ões) em Ações e BDRs."),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Ativos encontrados na carteira" }),
    ).toBeTruthy();
    expect(screen.getByText("ITUB4").textContent).toContain(
      "Ação preferencial",
    );
    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/portfolio/chat/query"),
    );
    expect(call?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      intent: "asset-list",
      assetClassId: "brazilian_equities",
    });
  });

  it("renders a list response with no position items as an empty list", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({ message: "Não há ativos para mostrar." })
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais ações estão na carteira?");
    expect(await screen.findByText("Não há ativos para mostrar.")).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Ativos encontrados na carteira" }),
    ).toBeNull();
  });

  it("sends typed ticker and class queries to the backend", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return String(input).includes("/api/portfolio/chat/query")
        ? jsonResponse({
            message: "O valor atual acompanhado de ITUB4 é R$ 250,00.",
          })
        : jsonResponse({ objectives: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quanto tenho em ITUB4?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(/valor atual acompanhado de ITUB4/),
    ).toBeTruthy();
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/portfolio/chat/query"),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      intent: "asset-value",
      query: "ITUB4",
    });
  });
  it("shows and recovers from an objectives request failure", async () => {
    const user = userEvent.setup();
    let objectivesCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("/api/portfolio/objectives")) {
          objectivesCalls += 1;
          if (objectivesCalls < 3)
            return Promise.reject(new Error("Objetivos indisponíveis"));
          return jsonResponse({
            objectives: [
              {
                id: reserveObjectiveId,
                name: "Reserva de emergência",
                kind: "RESERVE",
                targetAmount: 1000,
                knownValue: 500,
                remainingAmount: 500,
                missingPositionCount: 0,
                unvaluedPositionCount: 0,
              },
            ],
          });
        }
        return jsonResponse({});
      }),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await waitFor(() => expect(objectivesCalls).toBe(1));
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quanto tenho em reserva?",
    );
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(
      await screen.findByText(
        /O valor conhecido em Reserva de emergência é R\$ 500,00/,
      ),
    ).toBeTruthy();
    expect(objectivesCalls).toBe(3);
  });

  it("keeps the loading animation only while the portfolio endpoint is pending", async () => {
    const user = userEvent.setup();
    let resolveQuery!: (
      response: Awaited<ReturnType<typeof jsonResponse>>,
    ) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? new Promise<Awaited<ReturnType<typeof jsonResponse>>>((resolve) => {
              resolveQuery = resolve;
            })
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais FIIs tenho?");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Conferindo sua carteira",
    );
    await act(async () =>
      resolveQuery(
        await jsonResponse({
          message: "Não encontrei posições em Fundos imobiliários (FIIs).",
          items: [],
        }),
      ),
    );
    expect(
      await screen.findByText(
        "Não encontrei posições em Fundos imobiliários (FIIs).",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a safe endpoint error and clears the loading state", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse(
              { message: "Não foi possível consultar os dados da carteira." },
              false,
            )
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais FIIs tenho?");
    expect(
      await screen.findByText(
        "Não foi possível consultar os dados da carteira.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses a safe fallback when the endpoint error has no usable message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({ message: "   " }, false)
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais FIIs tenho?");
    expect(
      await screen.findByText("Não foi possível consultar a carteira agora."),
    ).toBeTruthy();
  });

  it("uses a safe fallback when the portfolio query request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? Promise.reject(new Error("internal network details"))
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    await askQuestion(user, "Quais FIIs tenho?");
    expect(
      await screen.findByText("Não foi possível consultar a carteira agora."),
    ).toBeTruthy();
    expect(screen.queryByText("internal network details")).toBeNull();
  });

  it("lets the user choose between candidate positions returned by the backend", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({
              message: "Encontrei mais de uma posição para Ação.",
              items: [
                {
                  id: "itub3",
                  product: "Ação ordinária",
                  assetCode: "ITUB3",
                  issuer: "Itaú Unibanco",
                  institution: null,
                  valueCents: "10000",
                },
                {
                  id: "itub4",
                  product: "Ação preferencial",
                  assetCode: "ITUB4",
                  issuer: "Itaú Unibanco",
                  institution: null,
                  valueCents: "20000",
                },
              ],
            })
          : jsonResponse({ objectives: [] }),
      ),
    );
    renderAssistant();
    await user.click(
      screen.getByRole("button", { name: "Abrir assistente da carteira" }),
    );
    const input = screen.getByRole("textbox", {
      name: "Escreva uma pergunta para o assistente",
    });
    await user.type(input, "Quanto tenho em ação?");
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("group", { name: "Escolha o ativo" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /ITUB4/ }));
    expect(await screen.findByText(/R\$\s*200,00/)).toBeTruthy();
  });

  it("paginates candidate choices and handles a position without value or identity details", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: `asset-${index}`,
      product: index === 8 ? "Ativo sem detalhes" : `Ação ${index}`,
      assetCode: index === 8 ? null : `ITUB${index}`,
      issuer: null,
      institution: null,
      valueCents: index === 8 ? null : "10000",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({ message: "Encontrei várias posições.", items })
          : jsonResponse({ objectives: [] }),
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
      "Quanto tenho em ação?",
    );
    await user.keyboard("{Enter}");
    await user.click(
      screen.getByRole("button", { name: "Ver mais ativos (1)" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Ativo sem detalhes" }),
    );
    expect(
      await screen.findByText(
        "Não há valor atual confirmado para Ativo sem detalhes.",
      ),
    ).toBeTruthy();
  });

  it("shows a candidate value when its ticker and issuer are missing", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) =>
        String(input).includes("/api/portfolio/chat/query")
          ? jsonResponse({
              message: "Encontrei várias posições.",
              items: [
                {
                  id: "without-identity",
                  product: "Ativo sem identificação",
                  assetCode: null,
                  issuer: null,
                  institution: null,
                  valueCents: "12345",
                },
                {
                  id: "other",
                  product: "Outro ativo",
                  assetCode: "ITUB4",
                  issuer: "Itaú Unibanco",
                  institution: null,
                  valueCents: "10000",
                },
              ],
            })
          : jsonResponse({ objectives: [] }),
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
      "Quanto tenho em ação?",
    );
    await user.keyboard("{Enter}");
    await screen.findByRole("group", { name: "Escolha o ativo" });
    await user.click(
      screen.getByRole("button", { name: "Ativo sem identificação" }),
    );
    expect(
      await screen.findByText(
        /O valor atual acompanhado de Ativo sem identificação é R\$\s*123,45/,
      ),
    ).toBeTruthy();
  });
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
            {
              id: "unsupported-purpose-id",
              name: "Objetivo sem categoria conhecida",
              kind: "CUSTOM",
              purpose: "FUTURE_PURPOSE",
              targetAmount: null,
              knownValue: 30,
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
    expect(choices.textContent).not.toContain(
      "Objetivo sem categoria conhecida",
    );
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
    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quero cadastrar uma posição manual",
    );
    await user.keyboard("{Enter}");
    await user.type(
      screen.getByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
      "Fundo para apagar",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar cadastro" }));
    expect(
      screen.queryByRole("button", { name: "Cadastrar posição manual" }),
    ).toBeNull();

    await user.type(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
      "Quero cadastrar uma posição manual",
    );
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("textbox", {
        name: "Resposta para o cadastro da posição",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("Fundo para apagar")).toBeNull();
  });

  it("uses a voice transcript as a new draft and appends it to an existing draft", async () => {
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

    await user.click(screen.getByRole("button", { name: "Simular audio" }));
    expect((input as HTMLInputElement).value).toBe("texto reconhecido");

    await user.clear(input);
    await user.type(input, "  Minha pergunta  ");
    await user.click(screen.getByRole("button", { name: "Simular audio" }));
    expect((input as HTMLInputElement).value).toBe(
      "Minha pergunta texto reconhecido",
    );
  });

  it("hides the input while recording and sends the captured transcript once", async () => {
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
    await user.type(input, "Tenho uma dúvida");
    await user.click(
      screen.getByRole("button", { name: "Simular gravação ativa" }),
    );

    expect(
      screen.queryByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
    ).toBeNull();
    const sendButton = screen.getByRole("button", { name: "Enviar mensagem" });
    expect(sendButton.hasAttribute("disabled")).toBe(false);
    await user.click(sendButton);

    expect(
      await screen.findByText("Tenho uma dúvida texto reconhecido"),
    ).toBeTruthy();
    expect(
      screen.getAllByText("Tenho uma dúvida texto reconhecido"),
    ).toHaveLength(1);
    expect(
      await screen.findByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
    ).toBeTruthy();
  });

  it("sends the existing draft when recording ends without recognized speech", async () => {
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
    await user.type(input, "Minha pergunta existente");
    await user.click(
      screen.getByRole("button", { name: "Simular gravação sem fala" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByText("Minha pergunta existente")).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Escreva uma pergunta para o assistente",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("sends a voice transcript when no text draft exists", async () => {
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
      screen.getByRole("button", { name: "Simular gravação ativa" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByText("texto reconhecido")).toBeTruthy();
    expect(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
    ).toBeTruthy();
  });

  it("keeps an empty draft when no speech is recognized and there is no text to send", async () => {
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
      screen.getByRole("button", { name: "Simular gravação sem fala" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      screen.getByRole("textbox", {
        name: "Escreva uma pergunta para o assistente",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("texto reconhecido")).toBeNull();
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
            categories: [
              { key: "reserve", value: 1000, percentage: 25 },
              { key: "long_term", value: 3000, percentage: 75 },
            ],
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

    expect(await screen.findByText("R$ 63.171,81")).toBeTruthy();
    expect(screen.getByText(/3 posições sem valor confirmado/)).toBeTruthy();
    expect(
      screen.queryByRole("group", { name: "Perguntas rápidas" }),
    ).toBeNull();
  });

  it("renders a destination chart with the direct portfolio total answer", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [],
          destinationSummary: {
            knownTotal: 4000,
            categories: [{ key: "reserve", value: 4000, percentage: 100 }],
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
      "Qual é meu patrimônio?",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByRole("img", {
        name: /Gráfico de rosca do patrimônio conhecido, total R\$\s*4\.000,00, por destino/,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Patrimônio conhecido")).toBeTruthy();
    expect(screen.getByText("R$ 4.000,00").className).toContain("text-primary");
    expect(
      screen.getByText("Valores acompanhados na plataforma."),
    ).toBeTruthy();
    expect(screen.queryByText(/Seu patrimônio conhecido é/)).toBeNull();
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

    expect(await screen.findByText("R$ 63.171,81")).toBeTruthy();
    expect(screen.getByText("R$ 63.171,81").className).toContain(
      "text-primary",
    );
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

    expect(await screen.findByText("R$ 63.171,81")).toBeTruthy();
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
    expect(screen.getByText(/o total pode mudar/)).toBeTruthy();
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

    expect(await screen.findByText("R$ 63.171,81")).toBeTruthy();
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

    expect(
      await screen.findByText(/aporte mensal planejado de R\$ 1\.250,00/),
    ).toBeTruthy();
  });

  it("answers a category specific monthly contribution question directly", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          objectives: [
            {
              id: "travel",
              name: "Viagem",
              purpose: "PERSONAL_GOAL",
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
      "Quanto planejei aportar por mes nos objetivos pessoais?",
    );
    await user.keyboard("{Enter}");

    expect(
      await screen.findByText(
        /aporte mensal planejado de R\$ 1\.250,00 para Viagem/,
      ),
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
      screen.queryByRole("button", { name: "Cadastrar posição manual" }),
    ).toBeNull();
    expect(
      screen.getByRole("group", { name: "Consultas rápidas" }),
    ).toBeTruthy();
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
    ).toBe("/planejamento?objective=long-term");
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
      "Oi! Pergunte o que você quer entender sobre sua carteira.",
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

    await user.click(
      screen.getByRole("button", { name: "Quanto falta para minha meta?" }),
    );
    await user.click(await screen.findByRole("button", { name: "Viagem" }));
    expect(await screen.findByText(/faltam R\$ 4\.000,00/)).toBeTruthy();
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

    expect(await screen.findByText("Conferindo seus objetivos")).toBeTruthy();
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
      "/planejamento?objective=travel",
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
    ).toBe("/carteira?panel=objectives");
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
    ).toBe("/planejamento?objective=travel%20trip");
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
    ).toBe("/planejamento");
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
    ).toBe("/planejamento");
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
    ).toBe("/planejamento?objective=travel");
  }, 15_000);

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
      await screen.findByRole("textbox", {
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
    ).toBe("/planejamento");
    expect(screen.queryByRole("button", { name: "Reserva" })).toBeNull();
  }, 15_000);

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
    expect(await screen.findByText("Conferindo seus objetivos")).toBeTruthy();

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
    ).toBe("/carteira?panel=objectives");
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
  }, 15_000);
});
