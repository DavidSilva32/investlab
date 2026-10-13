import { reserveObjectiveId } from "@/lib/portfolio-objectives";

export type PortfolioChatIntent =
  "objective-value" | "objective-gap" | "planning";

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
  "objective-value": [
    "qual o valor",
    "quanto vale",
    "quanto tenho",
    "quanto tem",
    "qual saldo",
    "saldo conhecido",
    "valor conhecido",
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

  const matchedIntents = (
    Object.entries(intentPhrases) as [PortfolioChatIntent, string[]][]
  ).filter(([, phrases]) =>
    phrases.some((phrase) =>
      containsPhrase(normalizedMessage, normalizePortfolioChatText(phrase)),
    ),
  );

  if (matchedIntents.length !== 1) return null;

  const objective = findObjectiveId(normalizedMessage, objectives);
  return {
    intent: matchedIntents[0][0],
    objectiveId: objective.id,
    objectiveAmbiguous: objective.ambiguous,
  };
}
