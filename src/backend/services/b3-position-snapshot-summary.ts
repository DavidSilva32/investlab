type B3PositionSnapshotEntry = {
  product: string;
  quantity: string;
  totalValue: string | null;
  unitPrice: string | null;
  valuationSource: string | null;
  assetCode: string | null;
  institution: string | null;
  issuer: string | null;
  indexer: string | null;
  regimeType: string | null;
  issuedAt: string | null;
  maturityAt: string | null;
};

export type B3PositionSnapshotComparison = {
  comparisonAvailable: boolean;
  currentReferenceDate: string;
  previousReferenceDate: string | null;
  currentPositionCount: number;
  previousPositionCount: number | null;
  updatedCount: number;
  unchangedCount: number;
  unmatchedInCurrentCount: number;
  absentFromCurrentFileCount: number;
  notComparableCount: number;
};

function normalizePart(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

function normalizeNumeric(value: string | null) {
  if (value === null) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return value.trim();
  const integer = match[2]!.replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  const isZero = integer === "0" && fraction.length === 0;
  return `${match[1] === "-" && !isZero ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

export function getB3PositionSnapshotIdentity(
  position: B3PositionSnapshotEntry,
) {
  if (position.assetCode?.trim()) {
    return JSON.stringify([
      normalizePart(position.assetCode),
      normalizePart(position.product),
      normalizePart(position.institution),
      normalizePart(position.issuer),
    ]);
  }
  if (
    position.product.trim() &&
    position.institution?.trim() &&
    position.issuer?.trim() &&
    position.maturityAt
  ) {
    return JSON.stringify([
      normalizePart(position.product),
      normalizePart(position.institution),
      normalizePart(position.issuer),
      normalizePart(position.indexer),
      normalizePart(position.regimeType),
      position.issuedAt,
      position.maturityAt,
    ]);
  }
  return null;
}

function byIdentity(positions: B3PositionSnapshotEntry[]) {
  const grouped = new Map<string, B3PositionSnapshotEntry[]>();
  let unidentifiedCount = 0;
  for (const position of positions) {
    const identity = getB3PositionSnapshotIdentity(position);
    if (identity === null) {
      unidentifiedCount += 1;
      continue;
    }
    const group = grouped.get(identity) ?? [];
    group.push(position);
    grouped.set(identity, group);
  }
  return { grouped, unidentifiedCount };
}

export function summarizeB3PositionSnapshotChange(
  currentPositions: B3PositionSnapshotEntry[],
  currentReferenceDate: string,
  previous: {
    positions: B3PositionSnapshotEntry[];
    referenceDate: string;
  } | null,
): B3PositionSnapshotComparison {
  if (!previous) {
    return {
      comparisonAvailable: false,
      currentReferenceDate,
      previousReferenceDate: null,
      currentPositionCount: currentPositions.length,
      previousPositionCount: null,
      updatedCount: 0,
      unchangedCount: 0,
      unmatchedInCurrentCount: 0,
      absentFromCurrentFileCount: 0,
      notComparableCount: currentPositions.length,
    };
  }

  const current = byIdentity(currentPositions);
  const previousEntries = byIdentity(previous.positions);
  const identityKeys = new Set([
    ...current.grouped.keys(),
    ...previousEntries.grouped.keys(),
  ]);
  let updatedCount = 0;
  let unchangedCount = 0;
  let unmatchedInCurrentCount = 0;
  let absentFromCurrentFileCount = 0;
  let notComparableCount = current.unidentifiedCount;

  for (const identity of identityKeys) {
    const currentGroup = current.grouped.get(identity) ?? [];
    const previousGroup = previousEntries.grouped.get(identity) ?? [];
    if (currentGroup.length > 1 || previousGroup.length > 1) {
      notComparableCount += currentGroup.length;
      continue;
    }
    if (currentGroup.length === 0) {
      absentFromCurrentFileCount += previousGroup.length;
      continue;
    }
    if (previousGroup.length === 0) {
      unmatchedInCurrentCount += 1;
      continue;
    }
    const currentPosition = currentGroup[0]!;
    const previousPosition = previousGroup[0]!;
    const changed =
      normalizeNumeric(currentPosition.quantity) !==
        normalizeNumeric(previousPosition.quantity) ||
      normalizeNumeric(currentPosition.unitPrice) !==
        normalizeNumeric(previousPosition.unitPrice) ||
      normalizeNumeric(currentPosition.totalValue) !==
        normalizeNumeric(previousPosition.totalValue) ||
      currentPosition.valuationSource !== previousPosition.valuationSource;
    if (changed) updatedCount += 1;
    else unchangedCount += 1;
  }

  notComparableCount += previousEntries.unidentifiedCount;

  return {
    comparisonAvailable: true,
    currentReferenceDate,
    previousReferenceDate: previous.referenceDate,
    currentPositionCount: currentPositions.length,
    previousPositionCount: previous.positions.length,
    updatedCount,
    unchangedCount,
    unmatchedInCurrentCount,
    absentFromCurrentFileCount,
    notComparableCount,
  };
}
