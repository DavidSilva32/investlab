import { decimalToCents } from "@/lib/portfolio-money";

type TradingRecord = {
  id: string;
  importId: string;
  sourceRow: number;
  identityFingerprint: string;
  side: "BUY" | "SELL";
  tradingDate: string;
  market: string | null;
  product: string;
  assetCode: string | null;
  originalAssetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  grossValue: string | null;
};

type MovementRecord = {
  id: string;
  importId?: string;
  sourceRow?: number;
  eventFingerprint?: string;
  direction: string;
  occurredAt: string;
  movementType: string;
  product: string;
  assetCode: string | null;
  originalAssetCode: string | null;
  institution: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
};

const normalized = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleUpperCase("pt-BR");

const decimal = (value: string) => {
  const [integer, fraction = ""] = value.split(".");
  /* v8 ignore next -- persisted numeric columns always include an integer part. */
  const normalizedInteger = integer.replace(/^(-?)0+(?=\d)/, "$1") || "0";
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedInteger}.${normalizedFraction}`
    : normalizedInteger;
};

function expectedSettlementDate(tradingDate: string) {
  const date = new Date(`${tradingDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== tradingDate ||
    date.getUTCDay() === 0 ||
    date.getUTCDay() === 6
  )
    return null;

  let businessDays = 0;
  while (businessDays < 2) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }
  return date.toISOString().slice(0, 10);
}

function valueComparison(
  tradeValue: string | null,
  movementValue: string | null,
) {
  const tradeCents = decimalToCents(tradeValue);
  const movementCents = decimalToCents(movementValue);
  if (tradeCents === null || movementCents === null) {
    return {
      valueDifferenceCents: null,
      valueComparison: "unavailable" as const,
    };
  }
  const difference = movementCents - tradeCents;
  return {
    valueDifferenceCents: difference.toString(),
    valueComparison:
      difference === 0n ? ("equal" as const) : ("different" as const),
  };
}

const pairDetails = (trade: TradingRecord, movement: MovementRecord) => ({
  tradeId: trade.id,
  movementId: movement.id,
  trade: {
    sourceRow: trade.sourceRow,
    date: trade.tradingDate,
    side: trade.side,
    ticker: trade.assetCode,
    originalTicker: trade.originalAssetCode,
    product: trade.product,
    institution: trade.institution,
    quantity: trade.quantity,
    unitPrice: trade.unitPrice,
    value: trade.grossValue,
  },
  movement: {
    sourceRow: movement.sourceRow ?? null,
    date: movement.occurredAt,
    direction: movement.direction,
    movementType: movement.movementType,
    ticker: movement.assetCode,
    originalTicker: movement.originalAssetCode,
    product: movement.product,
    institution: movement.institution,
    quantity: movement.quantity,
    unitPrice: movement.unitPrice,
    value: movement.operationValue,
  },
  ...valueComparison(trade.grossValue, movement.operationValue),
});

export function buildB3ReconciliationSummary(
  trades: TradingRecord[],
  movements: MovementRecord[],
  events: Array<{
    tradingItemId: string;
    movementItemId: string;
    status: "LINK" | "KEEP_SEPARATE";
    eventOrder: number;
  }> = [],
) {
  const latestDecisionByPair = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    const key = JSON.stringify([event.tradingItemId, event.movementItemId]);
    const current = latestDecisionByPair.get(key);
    if (!current || event.eventOrder > current.eventOrder)
      latestDecisionByPair.set(key, event);
  }
  const duplicates = new Map<
    string,
    { ids: string[]; sourceRows: number[]; importIds: Set<string> }
  >();
  for (const trade of trades) {
    const group = duplicates.get(trade.identityFingerprint) ?? {
      ids: [],
      sourceRows: [],
      importIds: new Set<string>(),
    };
    group.ids.push(trade.id);
    group.sourceRows.push(trade.sourceRow);
    group.importIds.add(trade.importId);
    duplicates.set(trade.identityFingerprint, group);
  }
  const duplicateCandidates = [...duplicates.entries()]
    .filter(([, group]) => group.ids.length > 1)
    .map(([identityFingerprint, group]) => ({
      identityFingerprint,
      occurrenceCount: group.ids.length,
      sourceRows: group.sourceRows,
      importCount: group.importIds.size,
      status: "ambiguous" as const,
    }));
  const movementDuplicates = new Map<
    string,
    { ids: string[]; sourceRows: number[]; importIds: Set<string> }
  >();
  for (const movement of movements) {
    if (!movement.eventFingerprint) continue;
    const group = movementDuplicates.get(movement.eventFingerprint) ?? {
      ids: [],
      sourceRows: [],
      importIds: new Set<string>(),
    };
    group.ids.push(movement.id);
    if (movement.sourceRow !== undefined)
      group.sourceRows.push(movement.sourceRow);
    if (movement.importId) group.importIds.add(movement.importId);
    movementDuplicates.set(movement.eventFingerprint, group);
  }
  const movementDuplicateCandidates = [...movementDuplicates.entries()]
    .filter(([, group]) => group.ids.length > 1)
    .map(([eventFingerprint, group]) => ({
      eventFingerprint,
      occurrenceCount: group.ids.length,
      sourceRows: group.sourceRows,
      importCount: group.importIds.size,
      status: "ambiguous" as const,
    }));

  const candidates: Array<{
    tradeId: string;
    movementId: string;
    status: "candidate";
    trade: ReturnType<typeof pairDetails>["trade"];
    movement: ReturnType<typeof pairDetails>["movement"];
  }> = [];
  const confirmed: Array<ReturnType<typeof pairDetails>> = [];
  const ambiguous: Array<{
    tradeId: string;
    movementIds: string[];
    pairs: Array<ReturnType<typeof pairDetails>>;
    status: "ambiguous";
  }> = [];
  const separated: Array<ReturnType<typeof pairDetails>> = [];
  const unmatched: Array<{
    tradeId: string;
    trade: ReturnType<typeof pairDetails>["trade"];
    reason: string;
  }> = [];
  const possibleByTrade = new Map<string, MovementRecord[]>();
  const dateMismatchByTrade = new Set<string>();
  for (const trade of trades) {
    const settlementDate = expectedSettlementDate(trade.tradingDate);
    const sameOperation = (movement: MovementRecord) => {
      if (!trade.assetCode || !movement.assetCode) return false;
      if (normalized(trade.assetCode) !== normalized(movement.assetCode))
        return false;
      const expectedDirection = trade.side === "BUY" ? "CREDITO" : "DEBITO";
      if (normalized(expectedDirection) !== normalized(movement.direction))
        return false;
      if (
        trade.institution &&
        movement.institution &&
        normalized(trade.institution) !== normalized(movement.institution)
      )
        return false;
      if (decimal(trade.quantity) !== decimal(movement.quantity)) return false;
      return normalized(movement.movementType).includes("LIQUIDACAO");
    };
    if (!settlementDate && movements.some(sameOperation))
      dateMismatchByTrade.add(trade.id);
    const compatible = movements.filter((movement) => {
      if (!sameOperation(movement)) return false;
      if (!settlementDate || movement.occurredAt !== settlementDate) {
        dateMismatchByTrade.add(trade.id);
        return false;
      }
      return true;
    });
    for (const movement of compatible) {
      const decision = latestDecisionByPair.get(
        JSON.stringify([trade.id, movement.id]),
      );
      if (decision?.status === "KEEP_SEPARATE")
        separated.push(pairDetails(trade, movement));
    }
    const possible = compatible.filter(
      (movement) =>
        latestDecisionByPair.get(JSON.stringify([trade.id, movement.id]))
          ?.status !== "KEEP_SEPARATE",
    );
    possibleByTrade.set(trade.id, possible);
  }
  const tradeCountByMovement = new Map<string, number>();
  for (const possible of possibleByTrade.values()) {
    for (const movement of possible)
      tradeCountByMovement.set(
        movement.id,
        (tradeCountByMovement.get(movement.id) ?? 0) + 1,
      );
  }

  for (const trade of trades) {
    const possible = possibleByTrade.get(trade.id)!;
    const confirmedMovements = possible.filter(
      (movement) =>
        latestDecisionByPair.get(JSON.stringify([trade.id, movement.id]))
          ?.status === "LINK",
    );
    const sharedMovement = possible.some(
      (movement) => tradeCountByMovement.get(movement.id)! > 1,
    );
    if (confirmedMovements.length === 1 && !sharedMovement) {
      confirmed.push({
        ...pairDetails(trade, confirmedMovements[0]),
      });
    } else if (possible.length === 1 && !sharedMovement) {
      candidates.push({
        ...pairDetails(trade, possible[0]),
        status: "candidate",
      });
    } else if (
      possible.length > 1 ||
      confirmedMovements.length > 1 ||
      sharedMovement
    ) {
      ambiguous.push({
        tradeId: trade.id,
        movementIds: possible.map(({ id }) => id),
        pairs: possible.map((movement) => pairDetails(trade, movement)),
        status: "ambiguous",
      });
    } else {
      unmatched.push({
        tradeId: trade.id,
        trade: {
          sourceRow: trade.sourceRow,
          date: trade.tradingDate,
          side: trade.side,
          ticker: trade.assetCode,
          originalTicker: trade.originalAssetCode,
          product: trade.product,
          institution: trade.institution,
          quantity: trade.quantity,
          unitPrice: trade.unitPrice,
          value: trade.grossValue,
        },
        reason: dateMismatchByTrade.has(trade.id)
          ? "A data não coincide com D+2 em dias úteis. Sem calendário oficial de feriados da B3, não é possível sugerir este vínculo com segurança."
          : "Nenhuma liquidação com código, direção, quantidade e data D+2 compatíveis foi encontrada.",
      });
    }
  }

  return {
    candidates,
    confirmed,
    ambiguous,
    separated,
    unmatched,
    duplicateCandidates,
    movementDuplicateCandidates,
    history: {
      complete: false,
      reasons: [
        "O período importado não comprova o histórico completo de negociações.",
        "Vínculos entre negociação e movimentação são candidatos e exigem confirmação.",
        "D+2 considera fins de semana; feriados e suspensões de pregão exigem revisão porque o calendário oficial da B3 não está integrado.",
      ],
    },
  };
}
