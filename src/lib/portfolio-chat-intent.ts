import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type PortfolioChatIntent =
  | "objective-value"
  | "objective-gap"
  | "monthly-planned-contribution"
  | "portfolio-total"
  | "planning";

export type PortfolioChatObjectiveName = { id: string; name: string };

export type PortfolioChatMatch = {
  intent: PortfolioChatIntent;
  objectiveId: string | null;
  objectiveAmbiguous: boolean;
};

const reserveAliases = [
  "reserva de emergencia",
  "reserva emergencia",
  "reserva emergencial",
  "fundo de emergencia",
  "fundo emergencia",
];

const intentPhrases: Record<PortfolioChatIntent, string[]> = {
  "portfolio-total": [
    "patrimonio conhecido",
    "patrimonio total",
    "patrimonio da carteira",
    "valor total da carteira",
    "qual valor total",
    "total da carteira",
    "quanto tenho ao todo",
    "quanto tenho no total",
    "quanto tenho somando tudo",
    "quanto vale minha carteira",
    "qual o valor da carteira",
    "qual o valor total",
    "patrimonio hoje",
    "qual meu patrimonio",
    "qual e meu patrimonio",
    "qual e o meu patrimonio",
    "meu patrimonio hoje",
    "quanto tenho de patrimonio",
  ],
  "objective-value": [
    "qual o valor",
    "quanto vale",
    "quanto tenho",
    "quanto tem",
    "qual saldo",
    "saldo conhecido",
    "valor conhecido",
    "patrimonio conhecido",
    "qual patrimonio",
    "quanto esta guardado",
    "quanto esta acumulado",
    "valor acumulado",
    "quanto acumulei",
  ],
  "objective-gap": [
    "quanto falta",
    "falta quanto",
    "o que falta",
    "quanto falta para completar",
    "quanto falta para chegar",
    "quanto falta para atingir",
    "o que falta para chegar",
    "o que falta para completar",
    "diferenca para meta",
    "distancia da meta",
    "quanto falta atingir",
  ],
  "monthly-planned-contribution": [
    "aporte mensal planejado",
    "aporte mensal previsto",
    "quanto planejo aportar",
    "quanto pretendo aportar",
    "quanto planejei aportar",
    "quanto pretendo investir por mes",
    "quanto planejo investir por mes",
    "aporte mensal da",
    "aporte mensal para",
  ],
  planning: [
    "planejar",
    "planejamento",
    "simular",
    "simulacao",
    "projecao",
    "projetar",
    "quanto preciso aportar",
    "quanto investir por mes",
    "quanto guardar por mes",
    "quanto preciso guardar",
    "aporte mensal necessario",
    "quero chegar a",
    "quando atinjo",
    "quando chego a",
    "quando completo",
    "em quanto tempo atinjo",
    "em quanto tempo chego",
    "tempo para completar",
  ],
};

const intentClues: Record<PortfolioChatIntent, string[]> = {
  "portfolio-total": ["patrimonio", "carteira", "investimentos", "total"],
  "objective-value": [
    "objetivo",
    "saldo",
    "valor",
    "tenho",
    "guardado",
    "acumulado",
  ],
  "objective-gap": ["falta", "meta", "atingir", "completar", "restante"],
  "monthly-planned-contribution": [
    "aporte",
    "aportar",
    "investir",
    "mensal",
    "planejei",
    "pretendo",
  ],
  planning: ["simular", "planejar", "projetar", "cenario", "prazo"],
};

const intentOrder: PortfolioChatIntent[] = [
  "portfolio-total",
  "objective-value",
  "objective-gap",
  "monthly-planned-contribution",
  "planning",
];

/** Returns deterministic, clue-based suggestions for questions not recognized directly. */
export function rankPortfolioChatIntentSuggestions(
  message: string,
  limit = 3,
): PortfolioChatIntent[] {
  const words = new Set(normalizePortfolioChatText(message).split(" "));
  if (words.size === 0 || limit <= 0) return [];

  return intentOrder
    .map((intent, order) => ({
      intent,
      order,
      score: intentClues[intent].reduce(
        (total, clue) => total + Number(words.has(clue)),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, limit)
    .map(({ intent }) => intent);
}

export function normalizePortfolioChatText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function findObjectiveId(
  text: string,
  objectives: PortfolioChatObjectiveName[],
): { id: string | null; ambiguous: boolean } {
  const matches = objectives
    .map((objective) => ({
      id: objective.id,
      name: normalizePortfolioChatText(objective.name),
    }))
    .filter(({ name }) => name.length > 0 && containsPhrase(text, name));

  const reserveId = objectives.find(({ id }) => id === reserveObjectiveId)?.id;
  if (reserveId) {
    reserveAliases.forEach((alias) => {
      const name = normalizePortfolioChatText(alias);
      if (containsPhrase(text, name)) matches.push({ id: reserveId, name });
    });
  }

  if (matches.length === 0) return { id: null, ambiguous: false };

  const uniqueMatches = [
    ...new Map(matches.map((match) => [match.id, match])).values(),
  ];

  const mostSpecific = uniqueMatches.filter(
    ({ name }) =>
      !uniqueMatches.some(
        ({ name: otherName }) =>
          otherName.length > name.length && containsPhrase(otherName, name),
      ),
  );
  if (mostSpecific.length !== 1) return { id: null, ambiguous: true };
  return { id: mostSpecific[0].id, ambiguous: false };
}

export function recognizePortfolioChatMessage(
  message: string,
  objectives: PortfolioChatObjectiveName[] = [],
): PortfolioChatMatch | null {
  const normalizedMessage = normalizePortfolioChatText(message);
  if (!normalizedMessage) return null;

  const objective = findObjectiveId(normalizedMessage, objectives);
  const hasNamedObjective = objective.id !== null || objective.ambiguous;
  const portfolioTotalContext = [
    "patrimonio",
    "valor da carteira",
    "ao todo",
    "no total",
    "somando tudo",
  ].some((phrase) => containsPhrase(normalizedMessage, phrase));
  const explicitlyPortfolioWide = [
    "patrimonio total da carteira",
    "patrimonio conhecido da carteira",
    "patrimonio da carteira",
    "valor total da carteira",
    "total da carteira",
    "valor da carteira",
    "carteira inteira",
  ].some((phrase) => containsPhrase(normalizedMessage, phrase));
  const hasPlanningAction = [
    "simular",
    "simulacao",
    "planejar",
    "planejamento",
  ].some((phrase) => containsPhrase(normalizedMessage, phrase));

  const matchedIntents = (
    Object.entries(intentPhrases) as [PortfolioChatIntent, string[]][]
  )
    .filter(([, phrases]) =>
      phrases.some((phrase) =>
        containsPhrase(normalizedMessage, normalizePortfolioChatText(phrase)),
      ),
    )
    .filter(([intent]) => {
      if (
        hasNamedObjective &&
        !explicitlyPortfolioWide &&
        intent === "portfolio-total"
      ) {
        return false;
      }
      if (explicitlyPortfolioWide && intent === "objective-value") {
        return false;
      }
      if (hasPlanningAction && intent === "portfolio-total") {
        return false;
      }
      if (
        portfolioTotalContext &&
        !hasNamedObjective &&
        intent === "objective-value"
      ) {
        return false;
      }
      return true;
    });

  if (matchedIntents.length !== 1) return null;

  return {
    intent: matchedIntents[0][0],
    objectiveId: objective.id,
    objectiveAmbiguous: objective.ambiguous,
  };
}
