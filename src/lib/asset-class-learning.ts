import {
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

type AssetClassLearningContentBase = {
  imageSrc: string;
  thumbnailSrc: string;
  description: string;
};

export type AssetClassLearningContent =
  | (AssetClassLearningContentBase & {
      availability: "available";
      videoSrc: string;
    })
  | (AssetClassLearningContentBase & {
      availability: "coming-soon";
      videoSrc?: never;
    });

export const assetClassLearningContent: Record<
  StrategyAssetClassId,
  AssetClassLearningContent
> = {
  fiis: {
    imageSrc: "/images/asset-classes/fiis.webp",
    thumbnailSrc: "/images/asset-classes/fiis.webp",
    description:
      "Conheça os fundos imobiliários, suas estruturas e as diferentes formas de exposição a ativos e estratégias imobiliárias.",
    availability: "available",
    videoSrc: "/videos/fiis.mp4",
  },
  brazilian_equities: {
    imageSrc: "/images/asset-classes/brazilian-equities.webp",
    thumbnailSrc: "/images/asset-classes/brazilian-equities.webp",
    description:
      "Entenda participações em empresas listadas no Brasil e os recibos de ações negociados no país.",
    availability: "coming-soon",
  },
  international_etfs: {
    imageSrc: "/images/asset-classes/international-etfs.webp",
    thumbnailSrc: "/images/asset-classes/international-etfs.webp",
    description:
      "Conheça fundos negociados em bolsa que oferecem exposição a mercados internacionais.",
    availability: "coming-soon",
  },
  fixed_income: {
    imageSrc: "/images/asset-classes/fixed-income-office.webp",
    thumbnailSrc: "/images/asset-classes/fixed-income-office.webp",
    description:
      "Conheça instrumentos de dívida e as diferentes formas de exposição à renda fixa.",
    availability: "coming-soon",
  },
};

export function getLearningClassHref(id: StrategyAssetClassId) {
  return `/learn?class=${id}#class-content`;
}

export function resolveLearningClassId(
  value: string | string[] | undefined,
  defaultId: StrategyAssetClassId | null = null,
): StrategyAssetClassId | null {
  if (typeof value !== "string") return value === undefined ? defaultId : null;
  return strategyAssetClasses.some((assetClass) => assetClass.id === value)
    ? (value as StrategyAssetClassId)
    : null;
}
