import { describe, expect, it } from "vitest";
import {
  isPortfolioChatManualPositionRequest,
  isPortfolioChatManualPositionRequestAmbiguous,
  normalizePortfolioChatText,
  parsePortfolioChatManualPositionRequest,
  rankPortfolioChatIntentSuggestions,
  recognizePortfolioChatMessage,
} from "@/lib/portfolio-chat-intent";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const objectives = [
  { id: reserveObjectiveId, name: "Reserva de emergência", kind: "RESERVE" },
  { id: "travel", name: "Viagem", purpose: "PERSONAL_GOAL" },
  { id: "house", name: "Casa nova", purpose: "PERSONAL_GOAL" },
  {
    id: "international-trip",
    name: "Viagem internacional",
    purpose: "PERSONAL_GOAL",
  },
];

describe("normalizePortfolioChatText", () => {
  it("normalizes accents, casing, punctuation, and repeated whitespace", () => {
    expect(normalizePortfolioChatText("  QUANTO falta, PRA META?! ")).toBe(
      "quanto falta pra meta",
    );
  });
});

describe("isPortfolioChatManualPositionRequest", () => {
  it.each([
    "Quero cadastrar uma posição manual",
    "Pode criar um ativo na carteira?",
    "Adicionar investimento",
    "Incluir posição",
    "Registrar uma posição",
  ])("recognizes an explicit manual position request: %s", (message) => {
    expect(isPortfolioChatManualPositionRequest(message)).toBe(true);
  });

  it.each([
    "Quanto tenho de viagem?",
    "Quero planejar uma posição",
    "Criar uma meta",
    "Não comprei CDB",
  ])(
    "does not treat a consultation or unrelated request as a position creation: %s",
    (message) => {
      expect(isPortfolioChatManualPositionRequest(message)).toBe(false);
    },
  );

  it("recognizes conversational investment purchases and only pre-fills explicit details", () => {
    expect(
      parsePortfolioChatManualPositionRequest(
        "Acabei de comprar mil reais de CDB no Banco Inter",
      ),
    ).toEqual({
      product: "CDB",
      institution: "Banco Inter",
      assetClass: "Renda fixa",
      amount: 1000,
      currency: "BRL",
      valueBasis: "total_value",
      informationalCdiPercentage: 100,
    });
    expect(
      parsePortfolioChatManualPositionRequest(
        "Comprei CDB a 112,5% do CDI no Banco Inter",
      ),
    ).toMatchObject({
      product: "CDB",
      institution: "Banco Inter",
      informationalCdiPercentage: 112.5,
    });
    expect(
      parsePortfolioChatManualPositionRequest("Quero comprar um celular"),
    ).toBeNull();
  });

  it("marks a purchase combined with a supported consultation as ambiguous", () => {
    expect(
      isPortfolioChatManualPositionRequestAmbiguous(
        "Comprei CDB e quero ver meu patrimônio",
      ),
    ).toBe(true);
    expect(
      isPortfolioChatManualPositionRequestAmbiguous(
        "Acabei de comprar CDB no Banco Inter",
      ),
    ).toBe(false);
    expect(
      isPortfolioChatManualPositionRequestAmbiguous("Não comprei CDB"),
    ).toBe(false);
  });
});

describe("recognizePortfolioChatMessage", () => {
  it.each([
    ["Quanto tenho de patrimônio conhecido?", "portfolio-total"],
    ["Quanto tenho ao todo?", "portfolio-total"],
    ["Qual é o meu patrimônio hoje?", "portfolio-total"],
    ["Qual é o patrimônio total da carteira?", "portfolio-total"],
    ["Qual valor total da minha carteira?", "portfolio-total"],
    ["Quero simular o patrimônio total da carteira", "planning"],
    [
      "Quanto planejei aportar por mês na Casa nova?",
      "monthly-planned-contribution",
    ],
    ["Qual o aporte mensal da viagem?", "monthly-planned-contribution"],
    ["Aporte mensal viagem", "monthly-planned-contribution"],
    [
      "Quanto pretendo investir por mês para a Viagem?",
      "monthly-planned-contribution",
    ],
    ["Quanto tenho na viagem?", "objective-value"],
    ["Quanto eu tenho de viagem?", "objective-value"],
    ["Quanto de viagem?", "objective-value"],
    ["Quanto de reserva?", "objective-value"],
    ["qual SALDO conhecido da CASA NOVA!", "objective-value"],
    ["Qual o valor da reserva de emergência?", "objective-value"],
    ["Quanto tem no fundo de emergência?", "objective-value"],
    ["Quanto está guardado na reserva emergencial?", "objective-value"],
    ["Quanto falta pra viagem?", "objective-gap"],
    ["Quanto falta viagem?", "objective-gap"],
    ["Qual a diferença para meta da casa nova?", "objective-gap"],
    ["O que falta para atingir a meta da Viagem?", "objective-gap"],
    ["Quanto falta para completar a Casa nova?", "objective-gap"],
    ["O que falta para chegar à meta da Viagem?", "objective-gap"],
    ["Qual é a distância da meta da Casa nova?", "objective-gap"],
    ["Quero SIMULAR um plano para viagem", "planning"],
    ["Simular viagem", "planning"],
    ["Quanto preciso aportar?", "planning"],
    ["Quero planejar para chegar a R$ 100 mil", "planning"],
    ["Quero chegar a R$ 100 mil", "planning"],
    ["Tempo para completar a meta", "planning"],
    ["Quando atinjo a meta?", "planning"],
    ["Qual aporte mensal necessário para a Viagem?", "planning"],
    ["Quanto guardar por mês para a Viagem?", "planning"],
    ["Em quanto tempo atinjo a meta da Casa nova?", "planning"],
  ] as const)("recognizes %s", (message, intent) => {
    expect(recognizePortfolioChatMessage(message, objectives)?.intent).toBe(
      intent,
    );
  });

  it("resolves common emergency reserve names to the canonical reserve objective", () => {
    for (const message of [
      "Quanto eu tenho de reserva?",
      "Quanto tenho na minha reserva?",
    ]) {
      expect(recognizePortfolioChatMessage(message, objectives)).toMatchObject({
        intent: "objective-value",
        objectiveId: reserveObjectiveId,
        objectiveAmbiguous: false,
      });
    }

    for (const message of [
      "Qual o valor da reserva de emergência?",
      "Quanto tenho na reserva emergencial?",
      "Qual saldo do fundo de emergencia?",
    ]) {
      expect(recognizePortfolioChatMessage(message, objectives)).toMatchObject({
        intent: "objective-value",
        objectiveId: reserveObjectiveId,
        objectiveAmbiguous: false,
      });
    }
  });

  it("does not use custom objective names as classification keywords", () => {
    expect(
      recognizePortfolioChatMessage("Quanto tenho na viagem?", objectives),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto tenho na viagem internacional?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("recognizes purpose keywords but not a custom objective label", () => {
    expect(
      recognizePortfolioChatMessage("Quanto de longo prazo?"),
    ).toMatchObject({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage("Quanto de longo prazo?", [
        {
          id: "long-term",
          name: "Investimento da família",
          purpose: "LONG_TERM_INVESTMENT",
        },
      ]),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "long-term",
      objectiveAmbiguous: false,
    });
  });

  it("marks a purpose as ambiguous when several objectives share it", () => {
    expect(
      recognizePortfolioChatMessage("Quanto falta para a viagem?", [
        { id: "one", name: "Viagem", purpose: "PERSONAL_GOAL" },
        { id: "two", name: "Carro", purpose: "PERSONAL_GOAL" },
      ]),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("does not infer a goal from custom names and asks about mixed planning clues", () => {
    expect(
      recognizePortfolioChatMessage(
        "Quanto falta para Viagem e Casa nova?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto falta para Viagem e Viagem internacional?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quero simular um plano para reserva de emergência e Viagem",
        objectives,
      ),
    ).toEqual({
      intent: "planning",
      objectiveId: null,
      objectiveAmbiguous: true,
    });
  });

  it("does not match partial objective names, unknown wording, or mixed intents", () => {
    expect(
      recognizePortfolioChatMessage("quanto tenho", [
        { id: "travel", name: "Viagem" },
      ]),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage("quanto falta para viajar", objectives),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "qual é o melhor investimento?",
        objectives,
      ),
    ).toBeNull();
    expect(
      recognizePortfolioChatMessage("Quero ver o total?", objectives),
    ).toBeNull();
    expect(
      recognizePortfolioChatMessage("Quando foi o último aporte?", objectives),
    ).toBeNull();
    expect(
      recognizePortfolioChatMessage(
        "quanto tenho e quanto falta para a viagem",
        objectives,
      ),
    ).toBeNull();
    expect(
      recognizePortfolioChatMessage(
        "Quanto vou aportar na Viagem?",
        objectives,
      ),
    ).toBeNull();
    expect(
      recognizePortfolioChatMessage(
        "Quero simular o patrimônio total da carteira e quanto falta para Viagem",
        objectives,
      ),
    ).toBeNull();
    expect(recognizePortfolioChatMessage("   ", objectives)).toBeNull();
  });

  it("recognizes normalized questions and leaves custom names for user selection", () => {
    expect(
      recognizePortfolioChatMessage(
        "  QUANTO PRETENDO APORTAR POR MÊS NA CASA NOVA?!  ",
        objectives,
      ),
    ).toEqual({
      intent: "monthly-planned-contribution",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Qual o patrimônio TOTAL da carteira?",
        objectives,
      ),
    ).toEqual({
      intent: "portfolio-total",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("keeps total-sounding questions with an explicit objective reference scoped to goals", () => {
    expect(
      recognizePortfolioChatMessage(
        "Quanto tenho no total no objetivo Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto vale o patrimônio da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Qual patrimônio total da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("keeps explicitly portfolio-wide wording global even with a custom goal name", () => {
    expect(
      recognizePortfolioChatMessage(
        "Qual é o patrimônio total da carteira, incluindo Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "portfolio-total",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("does not infer a goal from a custom label inside a portfolio-wide question", () => {
    expect(
      recognizePortfolioChatMessage(
        "Qual o valor da carteira e qual o valor da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "portfolio-total",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
  });

  it("ranks only supported intents that match useful clues, deterministically", () => {
    expect(rankPortfolioChatIntentSuggestions("meu saldo")).toEqual([
      "objective-value",
    ]);
    expect(
      rankPortfolioChatIntentSuggestions("patrimônio e objetivo", 3),
    ).toEqual(["portfolio-total", "objective-value"]);
    expect(rankPortfolioChatIntentSuggestions("melhor investimento?")).toEqual(
      [],
    );
    expect(rankPortfolioChatIntentSuggestions("", 3)).toEqual([]);
    expect(rankPortfolioChatIntentSuggestions("saldo", 0)).toEqual([]);
  });
});
