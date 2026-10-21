import { getStrategyAssetClassId } from "@/lib/strategy-allocation";

export type AnalyzableEquityCandidate = {
  product: string;
  assetCode?: string | null;
  classification: {
    assetClass: string | null;
    subClass: string | null;
    geography: string | null;
  };
};

export function getAnalyzableEquityTicker(
  position: AnalyzableEquityCandidate,
): string | null {
  const ticker = position.assetCode?.trim().toUpperCase();
  if (!ticker || !/^[A-Z]{4}[0-9]{1,2}$/.test(ticker)) return null;

  const classId = getStrategyAssetClassId({
    product: position.product,
    assetClass: position.classification.assetClass,
    subClass: position.classification.subClass,
    geography: position.classification.geography,
  });
  const identity =
    `${position.product} ${position.classification.subClass ?? ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");

  if (
    classId !== "brazilian_equities" ||
    /\bbdrs?\b/.test(identity) ||
    !/\b(acao|acoes|ordinaria|preferencial)\b/.test(identity)
  ) {
    return null;
  }

  return ticker;
}
