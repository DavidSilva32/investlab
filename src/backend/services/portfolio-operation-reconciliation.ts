export type ManualPortfolioOperationInput = {
  side: "BUY" | "SELL";
  effectiveDate: string;
  product: string;
  assetCode: string | null;
  quantity: string;
  unitPrice: string;
  currency: string;
  fees: string | null;
};

export type ReconciliationMovement = {
  id: string;
  occurredAt: string;
  product: string;
  assetCode: string | null;
  quantity: string;
  unitPrice: string | null;
  operationValue: string | null;
  direction: string;
  movementType: string;
};

const normalizeText = (value: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");

const normalizeDecimal = (value: string) => {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return value.trim();
  const [, sign, rawInteger, rawFraction = "", exponentText] = match;
  const digits = `${rawInteger}${rawFraction}`;
  const point = rawInteger.length + Number(exponentText ?? 0);
  const integer =
    point <= 0
      ? "0"
      : point >= digits.length
        ? digits.padEnd(point, "0")
        : digits.slice(0, point);
  const fraction =
    point <= 0 ? `${"0".repeat(-point)}${digits}` : digits.slice(point);
  const normalizedInteger = integer.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return `${sign}${normalizedInteger}${normalizedFraction ? `.${normalizedFraction}` : ""}`;
};

const sameIdentity = (
  operation: ManualPortfolioOperationInput,
  movement: ReconciliationMovement,
) => {
  const operationCode = normalizeText(operation.assetCode);
  const movementCode = normalizeText(movement.assetCode);
  if (operationCode && movementCode) return operationCode === movementCode;
  return normalizeText(operation.product) === normalizeText(movement.product);
};

export function getPortfolioOperationCandidates(
  operations: Array<ManualPortfolioOperationInput & { id: string }>,
  movements: ReconciliationMovement[],
  links: Array<{ operationId: string; movementId: string }>,
) {
  const linkedOperations = new Set(links.map(({ operationId }) => operationId));
  const linkedMovements = new Set(links.map(({ movementId }) => movementId));
  return operations.flatMap((operation) => {
    if (linkedOperations.has(operation.id)) return [];
    const candidates = movements.flatMap((movement) => {
      if (
        linkedMovements.has(movement.id) ||
        operation.effectiveDate !== movement.occurredAt ||
        !sameIdentity(operation, movement) ||
        normalizeDecimal(operation.quantity) !==
          normalizeDecimal(movement.quantity)
      )
        return [];
      return [
        {
          operationId: operation.id,
          movementId: movement.id,
          operationSide: operation.side,
          operationProduct: operation.product,
          operationAssetCode: operation.assetCode,
          operationQuantity: operation.quantity,
          operationUnitPrice: operation.unitPrice,
          operationCurrency: operation.currency,
          operationFees: operation.fees,
          movement,
          monetaryValuesComparable: false as const,
          limitation:
            "A planilha da B3 não informa a moeda; os valores monetários não são comparáveis.",
        },
      ];
    });
    return candidates;
  });
}

export function getUnlinkedPortfolioMovements(
  movements: ReconciliationMovement[],
  links: Array<{ operationId: string; movementId: string }>,
) {
  const linkedMovements = new Set(links.map(({ movementId }) => movementId));
  return movements.filter((movement) => !linkedMovements.has(movement.id));
}

export function applyPortfolioOperationLinks(
  events: Array<{
    operationId: string;
    movementId: string;
    status: "LINK" | "UNLINK";
  }>,
) {
  const active = new Map<string, string>();
  for (const event of events) {
    if (event.status === "UNLINK") {
      if (active.get(event.operationId) === event.movementId)
        active.delete(event.operationId);
    } else {
      active.set(event.operationId, event.movementId);
    }
  }
  return [...active].map(([operationId, movementId]) => ({
    operationId,
    movementId,
  }));
}
