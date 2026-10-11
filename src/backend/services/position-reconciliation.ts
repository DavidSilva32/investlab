import { getEmergencyReserveAssetKey } from "@/lib/emergency-reserve-asset-key";
import { decimalToCents } from "@/lib/portfolio-money";

export type ReconciliationEvent = {
  id: string;
  manualAssetKey: string;
  importedAssetKey: string;
  status: "LINK" | "UNLINK" | "SEPARATE";
  effectiveFrom: string;
  recordedAt: Date | string;
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
  assetKey?: string;
  updatedAt?: Date | string;
  referenceDate?: string | null;
};
const normalized = (value?: string | null) =>
  value?.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR") ?? "";
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
    return imported.flatMap((incoming) => {
      const incomingCode = normalized(incoming.assetCode);
      // Full codes preserve share classes. A name is only a possible match,
      // and can never establish identity without an explicit decision.
      if (
        code && incomingCode
          ? code !== incomingCode
          : normalized(position.product) !== normalized(incoming.product)
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
          manualValue: position.totalValue ?? null,
          importedValue: incoming.totalValue ?? null,
          institution: incoming.institution ?? null,
          reasons,
        },
      ];
    });
  });
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
    else if (
      event.status === "UNLINK" ||
      previous?.importedAssetKey === event.importedAssetKey
    )
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
