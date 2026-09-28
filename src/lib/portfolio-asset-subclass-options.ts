import { portfolioAssetClassOptions } from "@/lib/portfolio-classification-options";

export type PortfolioAssetClass = (typeof portfolioAssetClassOptions)[number];

export const portfolioAssetSubClassSuggestions: Record<
  PortfolioAssetClass,
  readonly string[]
> = {
  "Renda fixa": [
    "Tesouro Selic",
    "Tesouro Prefixado",
    "Tesouro IPCA+",
    "CDB",
    "RDB",
    "LCI",
    "LCA",
    "Debênture",
    "CRI",
    "CRA",
    "Letra financeira",
    "ETF de renda fixa",
    "Fundo de renda fixa",
  ],
  "Renda variável": ["Ação", "BDR", "ETF de ações", "FII", "Fundo de ações"],
  Fundos: [
    "Fundo multimercado",
    "Fundo cambial",
    "Fundo de fundos",
    "Fundo de crédito privado",
    "Fiagro",
    "Outro fundo",
  ],
  Criptoativos: [
    "Bitcoin (BTC)",
    "Ethereum (ETH)",
    "Stablecoin",
    "Outro criptoativo",
  ],
  Imóveis: ["Residencial", "Comercial", "Terreno", "Rural"],
  Outros: [],
};

export function getPortfolioAssetSubClassSuggestions(
  assetClass: string | null | undefined,
): readonly string[] {
  if (
    !assetClass ||
    !portfolioAssetClassOptions.some((option) => option === assetClass)
  ) {
    return [];
  }
  return portfolioAssetSubClassSuggestions[assetClass as PortfolioAssetClass];
}
