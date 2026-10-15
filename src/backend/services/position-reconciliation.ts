import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { decimalToCents } from "@/lib/portfolio-money";

export type ReconciliationEvent = {
  id: string;
  manualAssetKey: string;
  importedAssetKey: string;
  status: "LINK" | "UNLINK" | "SEPARATE";
  effectiveFrom: string;
  recordedAt: Date | string;
  importId?: string | null;
};
export type ReconciliationDecision = {
  manualAssetKey: string;
  importedAssetKey: string;
  action: "link" | "separate";
  manualUpdatedAt: string;
};
type Position = {
  product: string;
  assetCode?: string | null;
  institution?: string | null;
  issuer?: string | null;
  indexer?: string | null;
  regimeType?: string | null;
  issuedAt?: string | null;
  maturityAt?: string | null;
  currency?: string;
  totalValue?: string | null;
  quantity?: string | null;
  availableQuantity?: string | null;
  unavailableQuantity?: string | null;
  unitPrice?: string | null;
  valuationSource?: string | null;
  mtmUnitPrice?: string | null;
  mtmTotalValue?: string | null;
  curveUnitPrice?: string | null;
  curveTotalValue?: string | null;
  closingUnitPrice?: string | null;
  closingTotalValue?: string | null;
  assetKey?: string;
  updatedAt?: Date | string;
  referenceDate?: string | null;
};
const normalized = (value?: string | null) =>
  value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR") ?? "";
const normalizedProduct = (value?: string | null) =>
  normalized(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+(?:S A|SA|LTDA|LIMITADA|CIA|COMPANHIA)$/g, "");
export function importedReconciliationKey(position: Position) {
  return getEmergencyReserveAssetKey({
    product: position.product,
    assetCode: position.assetCode ?? null,
    institution: position.institution ?? null,
    issuer: position.issuer ?? null,
    indexer: position.indexer ?? null,
    regimeType: position.regimeType ?? null,
    issuedAt: position.issuedAt ?? null,
    maturityAt: position.maturityAt ?? null,
  });
}
export function getReconciliationCandidates(
  imported: Position[],
  manual: Position[],
) {
  return manual.flatMap((position) => {
    if (!position.assetKey) return [];
    const code = normalized(position.assetCode);
    const candidates = imported.flatMap((incoming) => {
      const incomingCode = normalized(incoming.assetCode);
      // Full codes preserve share classes. A name is only a possible match,
      // and can never establish identity without an explicit decision.
      if (
        code && incomingCode
          ? code !== incomingCode
          : normalizedProduct(position.product) !==
            normalizedProduct(incoming.product)
      )
        return [];
      const reasons: string[] = [];
      const institution = normalized(position.institution);
      const incomingInstitution = normalized(incoming.institution);
      if (
        institution &&
        incomingInstitution &&
        institution !== incomingInstitution
      )
        reasons.push("different_institutions");
      if (position.currency && position.currency !== "BRL")
        reasons.push("different_currency");
      const manualValue = decimalToCents(position.totalValue);
      const importedValue = decimalToCents(incoming.totalValue);
      if (
        manualValue !== null &&
        importedValue !== null &&
        manualValue !== importedValue
      )
        reasons.push("different_values");
      if (!code || !incomingCode) reasons.push("missing_code");
      // The current source schemas contain no account identifier. Even exact
      // tickers and institutions therefore require explicit confirmation.
      const status = reasons.some((reason) => reason !== "missing_code")
        ? ("conflict" as const)
        : ("probable" as const);
      const manualUpdatedAt =
        position.updatedAt instanceof Date
          ? position.updatedAt.toISOString()
          : (position.updatedAt ?? "");
      return [
        {
          manualAssetKey: position.assetKey!,
          importedAssetKey: importedReconciliationKey(incoming),
          status,
          manualUpdatedAt,
          manualProduct: position.product,
          importedProduct: incoming.product,
          manualAssetCode: position.assetCode ?? null,
          importedAssetCode: incoming.assetCode ?? null,
          manualInstitution: position.institution ?? null,
          manualValue: position.totalValue ?? null,
          importedValue: incoming.totalValue ?? null,
          institution: incoming.institution ?? null,
          valueDifferenceCents:
            manualValue !== null && importedValue !== null
              ? manualValue >= importedValue
                ? manualValue - importedValue
                : importedValue - manualValue
              : null,
          reasons,
        },
      ];
    });
    candidates.sort((left, right) => {
      if (
        left.valueDifferenceCents === null &&
        right.valueDifferenceCents !== null
      )
        return 1;
      if (
        right.valueDifferenceCents === null &&
        left.valueDifferenceCents !== null
      )
        return -1;
      if (
        left.valueDifferenceCents !== null &&
        right.valueDifferenceCents !== null &&
        left.valueDifferenceCents !== right.valueDifferenceCents
      )
        return left.valueDifferenceCents < right.valueDifferenceCents ? -1 : 1;
      const leftSameInstitution =
        Boolean(position.institution) &&
        normalized(position.institution) === normalized(left.institution);
      const rightSameInstitution =
        Boolean(position.institution) &&
        normalized(position.institution) === normalized(right.institution);
      if (leftSameInstitution !== rightSameInstitution)
        return leftSameInstitution ? -1 : 1;
      return (
        normalizedProduct(left.importedProduct).localeCompare(
          normalizedProduct(right.importedProduct),
        ) ||
        normalized(left.importedAssetCode).localeCompare(
          normalized(right.importedAssetCode),
        ) ||
        left.importedAssetKey.localeCompare(right.importedAssetKey)
      );
    });
    const differences = candidates.map(
      (candidate) => candidate.valueDifferenceCents,
    );
    const knownDifferences = differences.filter(
      (difference): difference is bigint => difference !== null,
    );
    const minimum = knownDifferences.reduce<bigint | null>(
      (current, difference) =>
        current === null || difference < current ? difference : current,
      null,
    );
    const hasUniqueComparableMinimum =
      candidates.length > 1 &&
      minimum !== null &&
      knownDifferences.length === candidates.length &&
      knownDifferences.filter((difference) => difference === minimum).length ===
        1;
    return candidates.map((candidate) => ({
      ...candidate,
      valueDifferenceCents: candidate.valueDifferenceCents?.toString() ?? null,
      closestValue:
        hasUniqueComparableMinimum &&
        candidate.valueDifferenceCents === minimum,
    }));
  });
}

export function unresolvedReconciliationCandidates(
  candidates: ReturnType<typeof getReconciliationCandidates>,
  events: ReconciliationEvent[],
) {
  const latestByPair = latestReconciliationEventsByPair(events);
  const linkedManual = new Set(
    activeReconciliationLinks(events).map((event) => event.manualAssetKey),
  );
  return candidates.filter((candidate) => {
    if (linkedManual.has(candidate.manualAssetKey)) return false;
    const latest = latestByPair.get(
      JSON.stringify([candidate.manualAssetKey, candidate.importedAssetKey]),
    );
    if (!latest || latest.status === "UNLINK") return true;
    if (latest.status === "LINK") return false;
    return false;
  });
}

export function latestReconciliationEventsByPair(
  events: ReconciliationEvent[],
) {
  const latestByPair = new Map<string, ReconciliationEvent>();
  const ordered = [...events].sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() -
        new Date(right.recordedAt).getTime() || left.id.localeCompare(right.id),
  );
  for (const event of ordered) {
    latestByPair.set(
      JSON.stringify([event.manualAssetKey, event.importedAssetKey]),
      event,
    );
  }
  return latestByPair;
}
export function activeReconciliationLinks(
  events: ReconciliationEvent[],
  referenceDate?: string,
) {
  const latest = new Map<string, ReconciliationEvent>();
  const ordered = [...events]
    .filter((event) => !referenceDate || event.effectiveFrom <= referenceDate)
    .sort(
      (left, right) =>
        left.effectiveFrom.localeCompare(right.effectiveFrom) ||
        new Date(left.recordedAt).getTime() -
          new Date(right.recordedAt).getTime() ||
        left.id.localeCompare(right.id),
    );
  for (const event of ordered) {
    const previous = latest.get(event.manualAssetKey);
    if (event.status === "LINK") latest.set(event.manualAssetKey, event);
    else if (previous?.importedAssetKey === event.importedAssetKey)
      latest.delete(event.manualAssetKey);
  }
  return [...latest.values()].filter((event) => event.status === "LINK");
}
export function applyPositionReconciliation<
  I extends Position,
  M extends Position,
>(
  imported: I[],
  manual: M[],
  events: ReconciliationEvent[],
  referenceDate?: string,
): Array<I | M> {
  const links = activeReconciliationLinks(events, referenceDate);
  const aliasByImported = new Map(
    links.map((event) => [event.importedAssetKey, event.manualAssetKey]),
  );
  const linkedManual = new Set(links.map((event) => event.manualAssetKey));
  return [
    ...imported.map((position) => {
      const alias = aliasByImported.get(importedReconciliationKey(position));
      return alias
        ? {
            ...position,
            assetKey: alias,
            reconciliationOriginalAssetKey: importedReconciliationKey(position),
          }
        : position;
    }),
    ...manual.filter((position) => !linkedManual.has(position.assetKey ?? "")),
  ];
}
