import { createHash } from "node:crypto";

export type PortfolioAssetClassification = {
  assetClass: string | null;
  subClass: string | null;
  geography: string | null;
};

type ClassifiableAsset = {
  assetCode: string | null;
  product: string;
  issuer: string | null;
  institution: string | null;
  indexer: string | null;
  regimeType: string | null;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");

export const getPortfolioAssetKey = (asset: ClassifiableAsset) =>
  createHash("sha256")
    .update(
      [
        asset.assetCode,
        asset.product,
        asset.issuer,
        asset.institution,
        asset.indexer,
        asset.regimeType,
      ]
        .map(normalize)
        .join("\u001f"),
    )
    .digest("hex");

export function inferPortfolioAssetClassification(
  asset: ClassifiableAsset,
): PortfolioAssetClassification {
  const product = normalize(asset.product);
  const indexer = normalize(asset.indexer);

  if (
    /\b(fii|fiagro|fundo imobiliario|etf|fundo de investimento)\b/.test(product)
  ) {
    return {
      assetClass: "Fundos",
      subClass: asset.product.trim(),
      geography: null,
    };
  }
  if (/\b(acao|acoes|bdr)\b/.test(product)) {
    return {
      assetClass: "Renda variável",
      subClass: asset.product.trim(),
      geography: null,
    };
  }
  if (
    /\b(tesouro|cdb|rdb|lci|lca|debenture|cri|cra|letra financeira)\b/.test(
      product,
    )
  ) {
    return {
      assetClass: "Renda fixa",
      subClass: asset.product.trim(),
      geography: null,
    };
  }
  if (/\b(cdi|ipca|igpm|selic|prefixad[oa]|inpc)\b/.test(indexer)) {
    return {
      assetClass: "Renda fixa",
      subClass: [asset.indexer, asset.regimeType]
        .filter((value) => value?.trim())
        .join(" · "),
      geography: null,
    };
  }
  return { assetClass: null, subClass: null, geography: null };
}

export const portfolioAssetClassOptions = [
  "Renda fixa",
  "Renda variável",
  "Fundos",
  "Criptoativos",
  "Imóveis",
  "Outros",
] as const;

export const portfolioAssetGeographyOptions = [
  "Brasil",
  "Exterior",
  "Global",
] as const;
