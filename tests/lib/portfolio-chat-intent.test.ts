import { describe, expect, it } from "vitest";
import {
  normalizePortfolioChatText,
  rankPortfolioChatIntentSuggestions,
  recognizePortfolioChatMessage,
} from "@/lib/portfolio-chat-intent";
import { reserveObjectiveId } from "@/lib/portfolio-objectives";

const objectives = [
  { id: reserveObjectiveId, name: "Reserva de emergência" },
  { id: "travel", name: "Viagem" },
  { id: "house", name: "Casa nova" },
  { id: "international-trip", name: "Viagem internacional" },
];

describe("normalizePortfolioChatText", () => {
  it("normalizes accents, casing, punctuation, and repeated whitespace", () => {
    expect(normalizePortfolioChatText("  QUANTO falta, PRA META?! ")).toBe(
      "quanto falta pra meta",
    );
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

  it("links an exact objective name and prefers the most specific full name", () => {
    expect(
      recognizePortfolioChatMessage("Quanto tenho na viagem?", objectives),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "travel",
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto tenho na viagem internacional?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "international-trip",
      objectiveAmbiguous: false,
    });
  });

  it("recognizes a short value question for a compound objective name", () => {
    expect(
      recognizePortfolioChatMessage("Quanto de longo prazo?"),
    ).toMatchObject({
      intent: "objective-value",
      objectiveId: null,
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage("Quanto de longo prazo?", [
        { id: "long-term", name: "Longo prazo" },
      ]),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "long-term",
      objectiveAmbiguous: false,
    });
  });

  it("leaves objective selection unresolved when names are ambiguous", () => {
    expect(
      recognizePortfolioChatMessage("Quanto falta para a viagem?", [
        { id: "one", name: "Viagem" },
        { id: "two", name: "Viagem" },
      ]),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: true,
    });
  });

  it("keeps two distinct objective names ambiguous, ignoring only shorter names contained in longer ones", () => {
    expect(
      recognizePortfolioChatMessage(
        "Quanto falta para Viagem e Casa nova?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: null,
      objectiveAmbiguous: true,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto falta para Viagem e Viagem internacional?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-gap",
      objectiveId: "international-trip",
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

  it("recognizes normalized new questions and links their named objective", () => {
    expect(
      recognizePortfolioChatMessage(
        "  QUANTO PRETENDO APORTAR POR MÊS NA CASA NOVA?!  ",
        objectives,
      ),
    ).toEqual({
      intent: "monthly-planned-contribution",
      objectiveId: "house",
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

  it("keeps total-sounding questions about a named objective scoped to that objective", () => {
    expect(
      recognizePortfolioChatMessage(
        "Quanto tenho no total no objetivo Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "travel",
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Quanto vale o patrimônio da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "travel",
      objectiveAmbiguous: false,
    });
    expect(
      recognizePortfolioChatMessage(
        "Qual patrimônio total da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "objective-value",
      objectiveId: "travel",
      objectiveAmbiguous: false,
    });
  });

  it("keeps explicitly portfolio-wide wording global even when an objective is named", () => {
    expect(
      recognizePortfolioChatMessage(
        "Qual é o patrimônio total da carteira, incluindo Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "portfolio-total",
      objectiveId: "travel",
      objectiveAmbiguous: false,
    });
  });

  it("keeps a portfolio-wide value question global when it also names an objective", () => {
    expect(
      recognizePortfolioChatMessage(
        "Qual o valor da carteira e qual o valor da Viagem?",
        objectives,
      ),
    ).toEqual({
      intent: "portfolio-total",
      objectiveId: "travel",
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
