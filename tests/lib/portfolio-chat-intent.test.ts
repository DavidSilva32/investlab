import { describe, expect, it } from "vitest";
import {
  normalizePortfolioChatText,
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
    ["Quanto tenho na viagem?", "objective-value"],
    ["qual SALDO conhecido da CASA NOVA!", "objective-value"],
    ["Qual o valor da reserva de emergência?", "objective-value"],
    ["Quanto tem no fundo de emergência?", "objective-value"],
    ["Quanto está guardado na reserva emergencial?", "objective-value"],
    ["Quanto falta pra viagem?", "objective-gap"],
    ["Qual a diferença para meta da casa nova?", "objective-gap"],
    ["O que falta para atingir a meta da Viagem?", "objective-gap"],
    ["Quanto falta para completar a Casa nova?", "objective-gap"],
    ["O que falta para chegar à meta da Viagem?", "objective-gap"],
    ["Qual é a distância da meta da Casa nova?", "objective-gap"],
    ["Quero SIMULAR um plano para viagem", "planning"],
    ["Quanto preciso aportar?", "planning"],
    ["Quero planejar para chegar a R$ 100 mil", "planning"],
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
      recognizePortfolioChatMessage(
        "quanto tenho e quanto falta para a viagem",
        objectives,
      ),
    ).toBeNull();
    expect(recognizePortfolioChatMessage("   ", objectives)).toBeNull();
  });
});
