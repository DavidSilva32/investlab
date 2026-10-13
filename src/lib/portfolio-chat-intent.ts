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
  "reserva",
  "minha reserva",
  "reserva de emergencia",
  "reserva emergencia",
  "reserva emergencial",
  "fundo de emergencia",
  "fundo emergencia",
];

const valueKeywords = [
  "quanto",
  "valor",
  "saldo",
  "tenho",
  "tem",
  "guardado",
  "acumulado",
  "acumulei",
  "vale",
  "patrimonio",
  "conhecido",
];
const valueDetails = [
  "valor",
  "tenho",
  "tem",
  "guardado",
  "acumulado",
  "acumulei",
  "vale",
  "patrimonio",
];
const gapKeywords = [
  "falta",
  "restante",
  "atingir",
  "completar",
  "diferenca",
  "distancia",
];
const contributionKeywords = ["aporte", "aportar", "investir", "guardar"];
const planningKeywords = [
  "simular",
  "simulacao",
  "planejar",
  "planejamento",
  "projecao",
  "projetar",
  "preciso",
  "necessario",
];
const portfolioKeywords = [
  "patrimonio",
  "carteira",
  "investimento",
  "investimentos",
];
const totalKeywords = ["total", "todo", "somando", "inteiro"];
const explicitPortfolioPhrases = [
  "patrimonio total da carteira",
  "patrimonio conhecido da carteira",
  "patrimonio da carteira",
  "valor total da carteira",
  "total da carteira",
  "valor da carteira",
  "carteira inteira",
];

const intentClues: Record<PortfolioChatIntent, string[]> = {
  "portfolio-total": ["patrimonio", "carteira", "investimentos", "total"],
  "objective-value": [
    "objetivo",
    "saldo",
    "valor",
    "tenho",
    "reserva",
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

function hasKeyword(words: Set<string>, keywords: string[]): boolean {
  return keywords.some((keyword) => words.has(keyword));
}

function removeObjectiveNames(
  text: string,
  objectives: PortfolioChatObjectiveName[],
): string {
  const reserveExists = objectives.some(({ id }) => id === reserveObjectiveId);
  const names = [
    ...objectives.map(({ name }) => normalizePortfolioChatText(name)),
    ...(reserveExists
      ? reserveAliases.map((alias) => normalizePortfolioChatText(alias))
      : []),
  ]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return names.reduce(
    (remaining, name) => remaining.replaceAll(` ${name} `, " ").trim(),
    ` ${text} `,
  );
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
  const questionText = removeObjectiveNames(normalizedMessage, objectives);
  const words = new Set(questionText.split(" ").filter(Boolean));
  const hasValueDetail =
    hasKeyword(words, valueDetails) ||
    (words.has("saldo") &&
      (words.has("quanto") ||
        words.has("qual") ||
        words.has("conhecido") ||
        hasNamedObjective));
  const hasGapSignal = hasKeyword(words, gapKeywords);
  const hasContribution = hasKeyword(words, contributionKeywords);
  const hasPlannedContributionContext = hasKeyword(words, [
    "planejei",
    "planejado",
    "planejada",
    "previsto",
    "prevista",
    "pretendo",
    "planejo",
  ]);
  const hasMonthlyContext =
    hasPlannedContributionContext || hasKeyword(words, ["mensal", "mes"]);
  const hasPlanningAction = hasKeyword(words, planningKeywords);
  const hasPlanningTimeline =
    (words.has("tempo") || words.has("quando")) &&
    hasKeyword(words, [
      "atinjo",
      "atingir",
      "chego",
      "chegar",
      "completo",
      "completar",
    ]);
  const hasPlanningNeed =
    hasKeyword(words, ["preciso", "necessario"]) && hasContribution;
  const hasScenarioContribution =
    hasKeyword(words, ["aportar", "investir", "guardar"]) &&
    words.has("mes") &&
    !hasPlannedContributionContext;
  const hasDesiredMilestone = words.has("quero") && words.has("chegar");
  const isPlanning =
    hasPlanningAction ||
    hasPlanningTimeline ||
    hasDesiredMilestone ||
    hasPlanningNeed ||
    hasScenarioContribution;
  const isMonthlyContribution =
    hasContribution && hasMonthlyContext && !isPlanning;
  const hasUnqualifiedContribution =
    hasContribution && !isMonthlyContribution && !isPlanning;
  const isGap = hasGapSignal && !hasPlanningTimeline;
  const isValue =
    hasValueDetail ||
    (words.has("quanto") &&
      !isGap &&
      !isMonthlyContribution &&
      !isPlanning &&
      !hasUnqualifiedContribution);
  const hasPortfolioContext = hasKeyword(
    new Set(normalizedMessage.split(" ")),
    portfolioKeywords,
  );
  const hasTotalContext = hasKeyword(
    new Set(normalizedMessage.split(" ")),
    totalKeywords,
  );
  const explicitlyPortfolioWide = explicitPortfolioPhrases.some((phrase) =>
    containsPhrase(normalizedMessage, phrase),
  );
  const isPortfolioTotal =
    explicitlyPortfolioWide ||
    (!hasNamedObjective &&
      hasKeyword(new Set(normalizedMessage.split(" ")), valueKeywords) &&
      (hasPortfolioContext || hasTotalContext));

  const matchedIntents: PortfolioChatIntent[] = [];
  if (isPortfolioTotal && !isPlanning && !isGap && !isMonthlyContribution) {
    matchedIntents.push("portfolio-total");
  }
  if (
    isValue &&
    !explicitlyPortfolioWide &&
    !isPlanning &&
    !isMonthlyContribution &&
    !(isPortfolioTotal && !hasNamedObjective)
  ) {
    matchedIntents.push("objective-value");
  }
  if (isGap) matchedIntents.push("objective-gap");
  if (isMonthlyContribution)
    matchedIntents.push("monthly-planned-contribution");
  if (isPlanning) matchedIntents.push("planning");

  if (matchedIntents.length !== 1) return null;

  return {
    intent: matchedIntents[0],
    objectiveId: objective.id,
    objectiveAmbiguous: objective.ambiguous,
  };
}
