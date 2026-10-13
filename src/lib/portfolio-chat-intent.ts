import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type PortfolioChatIntent =
  | "objective-value"
  | "objective-gap"
  | "monthly-planned-contribution"
  | "portfolio-total"
  | "planning";

export type PortfolioChatObjectiveName = {
  id: string;
  name: string;
  kind?: string;
  purpose?: string | null;
};

export type PortfolioChatMatch = {
  intent: PortfolioChatIntent;
  objectiveId: string | null;
  objectiveAmbiguous: boolean;
};

export type PortfolioChatManualPositionRequest = {
  product: string | null;
  institution: string | null;
  assetClass: "Renda fixa" | null;
  amount: number | null;
  currency: "BRL" | null;
  valueBasis: "total_value" | null;
  informationalCdiPercentage: number | null;
};

const manualPositionActionWords = [
  "adicionar",
  "cadastrar",
  "criar",
  "incluir",
  "registrar",
  "registre",
  "registra",
  "registro",
  "cadastre",
  "cadastro",
  "inserir",
  "insere",
  "lancar",
  "anotar",
  "salvar",
  "salva",
  "gravar",
  "grave",
  "comprei",
  "comprar",
  "apliquei",
  "aplicar",
  "investi",
  "investir",
  "adquiri",
  "adquirir",
  "coloquei",
];
const manualPositionObjectWords = [
  "posicao",
  "ativo",
  "investimento",
  "investimentos",
  "carteira",
  "aplicacao",
  "aplicacoes",
  "titulo",
  "titulos",
  "renda",
  "papel",
  "ativos",
  "cdb",
  "rdb",
  "lci",
  "lca",
  "debenture",
  "tesouro",
  "acao",
  "acoes",
  "fii",
  "fundo",
  "etf",
  "criptoativo",
  "criptomoeda",
];
const fixedIncomeProductWords = ["cdb", "rdb", "lci", "lca", "debenture"];
const manualProductLabels = [
  "cdb",
  "rdb",
  "lci",
  "lca",
  "debenture",
  "tesouro direto",
  "tesouro selic",
  "tesouro ipca",
  "tesouro prefixado",
  "acao",
  "acoes",
  "fii",
  "etf",
];

export function isPortfolioChatManualPositionRequest(message: string): boolean {
  const normalized = normalizePortfolioChatText(message);
  const words = new Set(normalized.split(" "));
  if (["nao", "nunca", "jamais"].some((word) => words.has(word))) {
    return false;
  }
  const requestsCreation = manualPositionActionWords.some((word) =>
    words.has(word),
  );
  const namesPosition = manualPositionObjectWords.some((word) =>
    words.has(word),
  );
  return requestsCreation && namesPosition;
}

export function isPortfolioChatManualPositionRequestAmbiguous(
  message: string,
): boolean {
  const normalized = normalizePortfolioChatText(message);
  const combinesConsultation =
    normalized.includes(" e ") &&
    /\b(ver|consultar|mostrar|visualizar)\b/.test(normalized) &&
    /\b(patrimonio|carteira|objetivo|reserva)\b/.test(normalized);

  return (
    isPortfolioChatManualPositionRequest(message) &&
    (recognizePortfolioChatMessage(message) !== null || combinesConsultation)
  );
}

function parseMentionedAmount(message: string): number | null {
  const rawMatch =
    /(?:r\$\s*)?(\d[\d.,]*)\s*(milh(?:ão|ões)|mil|reais|real|brl)\b/i.exec(
      message,
    );
  const currencyMatch = /r\$\s*(\d[\d.,]*)/i.exec(message);
  if (!rawMatch && !currencyMatch && /\bmil\s+reais?\b/i.test(message))
    return 1_000;
  const match =
    rawMatch ??
    (currencyMatch ? [currencyMatch[0], currencyMatch[1], "real"] : null);
  if (!match) return null;
  const compact = match[1].replace(/\s/g, "");
  const numeric = Number(
    compact.includes(",")
      ? compact.replace(/\./g, "").replace(",", ".")
      : /\.\d{3}$/.test(compact)
        ? compact.replace(/\./g, "")
        : compact,
  );
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const multiplier = match[2].toLocaleLowerCase("pt-BR").startsWith("milh")
    ? 1_000_000
    : match[2].toLocaleLowerCase("pt-BR") === "mil"
      ? 1_000
      : 1;
  const amount = numeric * multiplier;
  return Number.isFinite(amount) ? amount : null;
}

/** Extracts only details stated clearly in an investment-registration utterance. */
export function parsePortfolioChatManualPositionRequest(
  message: string,
): PortfolioChatManualPositionRequest | null {
  const normalized = normalizePortfolioChatText(message);
  if (!isPortfolioChatManualPositionRequest(message)) return null;

  const productLabel = manualProductLabels.find((label) =>
    containsPhrase(normalized, label),
  );
  const bankMention = /\b(?:no|na|do|da)\s+banco\s+([a-z0-9]+)\b/.exec(
    normalized,
  );
  const genericInstitutionMention =
    /\b(?:no|na|do|da)\s+(?!cdi\b|cdb\b|rdb\b|brl\b)([a-z0-9]+)\b/.exec(
      normalized,
    );
  const institution = bankMention?.[1]
    ? `Banco ${bankMention[1]}`
        .split(" ")
        .map((word) => `${word[0]?.toLocaleUpperCase("pt-BR")}${word.slice(1)}`)
        .join(" ")
    : genericInstitutionMention?.[1]
      ? genericInstitutionMention[1]
          .split(" ")
          .map(
            (word) => `${word[0]?.toLocaleUpperCase("pt-BR")}${word.slice(1)}`,
          )
          .join(" ")
      : null;
  const product = productLabel ? productLabel.toLocaleUpperCase("pt-BR") : null;
  const assetClass = fixedIncomeProductWords.some((word) =>
    containsPhrase(normalized, word),
  )
    ? "Renda fixa"
    : null;
  const amount = parseMentionedAmount(message);
  const explicitCdiPercentage =
    /\b(\d+(?:[.,]\d+)?)\s*(?:%|por cento)\s*(?:do\s*)?cdi\b/i.exec(message);
  const informationalCdiPercentage =
    productLabel === "cdb"
      ? explicitCdiPercentage
        ? Number(explicitCdiPercentage[1].replace(",", "."))
        : 100
      : null;
  if (!product && amount === null) return null;

  return {
    product,
    institution,
    assetClass,
    amount,
    currency: amount === null ? null : "BRL",
    valueBasis: amount === null ? null : "total_value",
    informationalCdiPercentage,
  };
}

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
  "quantos",
  "quantas",
  "qual",
  "quais",
  "valor",
  "valores",
  "saldo",
  "tenho",
  "tem",
  "possuo",
  "possui",
  "guardado",
  "guardei",
  "acumulado",
  "acumulei",
  "juntei",
  "economizei",
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
  "faltam",
  "resta",
  "restam",
  "restante",
  "preciso",
  "precisaria",
  "atingir",
  "atingido",
  "completar",
  "completo",
  "diferenca",
  "distancia",
  "meta",
];
const contributionKeywords = [
  "aporte",
  "aportes",
  "aportar",
  "invisto",
  "investir",
  "investimento",
  "guardar",
  "guardo",
  "depositar",
  "deposito",
  "contribuir",
  "contribuicao",
];
const planningKeywords = [
  "simular",
  "simulacao",
  "simule",
  "planejar",
  "planejamento",
  "planejado",
  "projecao",
  "projetar",
  "projetado",
  "preciso",
  "necessario",
  "tempo",
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
  "portfolio-total": [
    "patrimonio",
    "carteira",
    "investimentos",
    "total",
    "somando",
    "inteiro",
    "tudo",
  ],
  "objective-value": [
    "objetivo",
    "saldo",
    "valor",
    "valores",
    "tenho",
    "quanto",
    "quantos",
    "quantas",
    "reserva",
    "guardado",
    "guardei",
    "acumulado",
    "juntei",
  ],
  "objective-gap": [
    "falta",
    "faltam",
    "meta",
    "atingir",
    "completar",
    "restante",
    "resta",
    "diferenca",
  ],
  "monthly-planned-contribution": [
    "aporte",
    "aportes",
    "aportar",
    "investir",
    "invisto",
    "mensal",
    "mes",
    "planejei",
    "pretendo",
    "guardar",
    "guardo",
  ],
  planning: [
    "simular",
    "simulacao",
    "planejar",
    "planejamento",
    "projetar",
    "projecao",
    "cenario",
    "quando",
    "tempo",
  ],
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

function removeObjectiveCategoryTerms(text: string): string {
  const terms = objectiveCategoryTerms()
    .map(normalizePortfolioChatText)
    .sort((left, right) => right.length - left.length);

  return terms.reduce(
    (remaining, term) => remaining.replaceAll(` ${term} `, " ").trim(),
    ` ${text} `,
  );
}

function objectiveCategoryTerms() {
  return [
    ...reserveAliases,
    "objetivos pessoais",
    "objetivo pessoal",
    "metas pessoais",
    "investimentos de longo prazo",
    "investimento de longo prazo",
    "longo prazo",
  ];
}

function findObjectiveId(
  text: string,
  objectives: PortfolioChatObjectiveName[],
): { id: string | null; ambiguous: boolean } {
  const matches = objectives.flatMap((objective) => {
    const terms =
      objective.id === reserveObjectiveId || objective.kind === "RESERVE"
        ? reserveAliases
        : objective.purpose === "PERSONAL_GOAL"
          ? ["objetivos pessoais", "objetivo pessoal", "metas pessoais"]
          : objective.purpose === "LONG_TERM_INVESTMENT"
            ? [
                "investimentos de longo prazo",
                "investimento de longo prazo",
                "longo prazo",
              ]
            : [];
    const matchingTerm = terms
      .map(normalizePortfolioChatText)
      .find((term) => containsPhrase(text, term));
    return matchingTerm ? [{ id: objective.id, name: matchingTerm }] : [];
  });

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
  const hasUnclassifiedPlanningClause =
    objective.id !== null &&
    normalizedMessage.includes(" e ") &&
    hasKeyword(new Set(normalizedMessage.split(" ")), [
      "simular",
      "simulacao",
      "planejar",
      "planejamento",
      "projetar",
      "projecao",
    ]);
  if (hasUnclassifiedPlanningClause) {
    objective.id = null;
    objective.ambiguous = true;
  }
  const hasNamedObjective = objective.id !== null || objective.ambiguous;
  const questionText = removeObjectiveCategoryTerms(normalizedMessage);
  const words = new Set(questionText.split(" ").filter(Boolean));
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
    hasKeyword(words, ["preciso", "necessario", "precisaria"]) &&
    hasContribution;
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
  const isGap =
    hasGapSignal &&
    !hasPlanningTimeline &&
    !hasPlanningNeed &&
    !hasScenarioContribution &&
    !hasPlanningAction;
  const isValue =
    !isPlanning &&
    (hasKeyword(words, [...valueDetails, "saldo", "conhecido"]) ||
      (words.has("quanto") &&
        !isGap &&
        !isMonthlyContribution &&
        !isPlanning &&
        !hasUnqualifiedContribution));
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
  const hasPortfolioValueQuestion =
    hasKeyword(words, valueDetails) || words.has("quanto");
  const hasObjectiveReference =
    hasNamedObjective ||
    hasKeyword(new Set(normalizedMessage.split(" ")), [
      "objetivo",
      "objetivos",
      "meta",
      "metas",
    ]);
  const hasSpecificReferent =
    /\b(?:da|do|de|na|no)\s+(?!carteira\b|investimentos?\b|patrimonio\b|reserva\b)[a-z]+\s*[?!.]*$/.test(
      normalizedMessage,
    );
  const isPortfolioTotal =
    explicitlyPortfolioWide ||
    (!hasObjectiveReference &&
      !hasSpecificReferent &&
      hasPortfolioValueQuestion &&
      (hasPortfolioContext || hasTotalContext));

  const matchedIntents: PortfolioChatIntent[] = [];
  const mixesPlanningAndGoalActions =
    isPlanning && hasGapSignal && normalizedMessage.includes(" e ");
  if (mixesPlanningAndGoalActions) return null;
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
