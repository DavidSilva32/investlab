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

export const portfolioAssetGeographyLabels: Record<
  (typeof portfolioAssetGeographyOptions)[number],
  string
> = {
  Brasil: "Brasil",
  Exterior: "Exterior",
  Global: "Global",
};

export const portfolioAssetGeographyHelpText =
  "Brasil: foco no mercado brasileiro. Exterior: foco em país ou região fora do Brasil. Global: exposição diversificada em vários mercados; pode incluir o Brasil.";
