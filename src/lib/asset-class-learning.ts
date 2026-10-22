import {
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

type AssetClassLearningContentBase = {
  imageSrc: string;
  thumbnailSrc: string;
  description: string;
  courseLessons: {
    title: string;
    content: string;
  }[];
  quiz: {
    question: string;
    options: {
      text: string;
      explanation: string;
    }[];
    correctOptionIndex: number;
  };
  sources: {
    label: string;
    href: string;
  }[];
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
    courseLessons: [
      {
        title: "O que é um fundo imobiliário?",
        content:
          "Um FII reúne recursos de várias pessoas para investir em imóveis ou em ativos ligados ao mercado imobiliário.",
      },
      {
        title: "A cota é sua participação",
        content:
          "Ao comprar cotas, você participa do fundo. Isso não significa ser dono direto de um imóvel específico.",
      },
      {
        title: "Rendimentos podem variar",
        content:
          "O preço da cota e os rendimentos não são garantidos e podem mudar.",
      },
    ],
    quiz: {
      question: "O que representa uma cota de FII?",
      options: [
        {
          text: "Uma participação em um fundo que investe no mercado imobiliário.",
          explanation:
            "Isso mesmo. A cota representa uma participação no fundo, que pode investir em imóveis ou em ativos imobiliários.",
        },
        {
          text: "A propriedade direta de um imóvel específico.",
          explanation:
            "A cota representa participação no fundo. Ela não significa, por si só, a propriedade direta de um imóvel específico.",
        },
        {
          text: "Um rendimento mensal garantido pelo fundo.",
          explanation:
            "Rendimentos podem variar e não são garantidos. A cota representa participação no fundo.",
        },
        {
          text: "Um empréstimo feito pelo investidor ao governo.",
          explanation:
            "Essa descrição se aproxima de alguns títulos públicos. Um FII é um fundo com cotas negociadas na bolsa.",
        },
      ],
      correctOptionIndex: 0,
    },
    sources: [
      {
        label: "Portal do Investidor: Fundos imobiliários",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii",
      },
      {
        label: "Portal do Investidor: Como negociar cotas de FII",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii/como-negociar",
      },
    ],
    availability: "available",
    videoSrc: "/videos/fiis.mp4",
  },
  brazilian_equities: {
    imageSrc: "/images/asset-classes/brazilian-equities.webp",
    thumbnailSrc: "/images/asset-classes/brazilian-equities.webp",
    description:
      "Entenda participações em empresas listadas no Brasil e os recibos de ações negociados no país.",
    courseLessons: [
      {
        title: "O que significa comprar uma ação?",
        content: "Uma ação representa uma pequena participação em uma empresa.",
      },
      {
        title: "O preço pode mudar",
        content:
          "Resultados da empresa e condições do mercado podem influenciar o preço da ação.",
      },
      {
        title: "Dividendos não são certos",
        content:
          "A empresa pode distribuir dividendos, mas não há garantia de pagamento ou de valorização.",
      },
    ],
    quiz: {
      question: "Ao comprar uma ação, o que você passa a ter?",
      options: [
        {
          text: "Uma pequena participação na empresa.",
          explanation:
            "Correto. A ação representa uma participação na empresa, e seu preço pode variar.",
        },
        {
          text: "Um valor fixo de volta em uma data combinada.",
          explanation:
            "Ações não prometem devolução de um valor fixo em uma data. Elas representam participação na empresa.",
        },
        {
          text: "Dividendos obrigatórios todo mês.",
          explanation:
            "A distribuição de dividendos não é garantida nem necessariamente mensal.",
        },
        {
          text: "A propriedade de todas as ações da empresa.",
          explanation:
            "Uma ação representa apenas uma fração da empresa, proporcional à quantidade e à classe de ações.",
        },
      ],
      correctOptionIndex: 0,
    },
    sources: [
      {
        label: "Portal do Investidor: Ações",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/acoes",
      },
    ],
    availability: "available",
    videoSrc: "/videos/brazilian_equities.mp4",
  },
  international_etfs: {
    imageSrc: "/images/asset-classes/international-etfs.webp",
    thumbnailSrc: "/images/asset-classes/international-etfs.webp",
    description:
      "Conheça fundos negociados em bolsa que oferecem exposição a mercados internacionais.",
    courseLessons: [
      {
        title: "Como funciona um ETF internacional?",
        content:
          "Um ETF é um fundo com cotas negociadas em bolsa. Ele pode acompanhar um índice ou uma carteira ligada a outros países.",
      },
      {
        title: "O exterior e o câmbio influenciam",
        content:
          "O resultado pode variar com os ativos do fundo, os mercados internacionais e a moeda.",
      },
      {
        title: "Índice não é promessa de retorno",
        content:
          "Acompanhar um índice não garante rendimento: o valor da cota pode subir ou cair.",
      },
    ],
    quiz: {
      question: "O que pode influenciar o resultado de um ETF internacional?",
      options: [
        {
          text: "Os ativos do fundo, o mercado externo e o câmbio.",
          explanation:
            "Correto. Esses fatores podem influenciar o resultado, junto com as características do próprio fundo.",
        },
        {
          text: "Somente a taxa básica de juros do Brasil.",
          explanation:
            "A taxa brasileira não é o único fator. Os ativos do fundo, mercados externos e câmbio também podem influenciar.",
        },
        {
          text: "Um rendimento fixo garantido pelo índice.",
          explanation:
            "Índices não garantem rendimento. O valor do ETF pode subir ou cair.",
        },
        {
          text: "Apenas a quantidade de cotas que a pessoa possui.",
          explanation:
            "A quantidade afeta o valor total da posição, mas não explica sozinha a variação de cada cota.",
        },
      ],
      correctOptionIndex: 0,
    },
    sources: [
      {
        label: "Portal do Investidor: Fundos de índice (ETFs)",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/etfs",
      },
      {
        label: "Portal do Investidor: Como escolher um ETF",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/etfs/como-escolher-um-etf",
      },
    ],
    availability: "available",
    videoSrc: "/videos/international_etfs.mp4",
  },
  fixed_income: {
    imageSrc: "/images/asset-classes/fixed-income-office.webp",
    thumbnailSrc: "/images/asset-classes/fixed-income-office.webp",
    description:
      "Conheça instrumentos de dívida e as diferentes formas de exposição à renda fixa.",
    courseLessons: [
      {
        title: "O que é renda fixa?",
        content:
          "As regras de remuneração são definidas na aplicação: podem ser prefixadas, acompanhar uma taxa ou combinar critérios.",
      },
      {
        title: "Cada produto tem suas condições",
        content:
          "Prazo, possibilidade de resgate e risco de crédito variam conforme o investimento.",
      },
      {
        title: "Renda fixa não é risco zero",
        content:
          "As condições do emissor e do produto importam; confira as regras antes de investir.",
      },
    ],
    quiz: {
      question: "O que quer dizer que um investimento é de renda fixa?",
      options: [
        {
          text: "Que as regras de remuneração são conhecidas, não que o retorno seja sempre igual.",
          explanation:
            "Isso mesmo. A forma de remuneração é definida, mas o valor final pode variar conforme as regras do produto.",
        },
        {
          text: "Que o investidor nunca pode perder dinheiro.",
          explanation:
            "Renda fixa não significa risco zero. Há riscos que dependem do emissor, do produto e das condições de saída.",
        },
        {
          text: "Que o dinheiro pode ser retirado a qualquer momento sem condições.",
          explanation:
            "A liquidez depende do produto. Alguns têm prazo ou condições para resgate.",
        },
        {
          text: "Que todos os produtos rendem a mesma taxa.",
          explanation:
            "Cada produto pode ter regras, prazos, emissores e riscos diferentes.",
        },
      ],
      correctOptionIndex: 0,
    },
    sources: [
      {
        label: "Portal do Investidor: Características dos investimentos",
        href: "https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos",
      },
      {
        label: "Portal do Investidor: Risco e relação risco x retorno",
        href: "https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos/risco-e-a-relacao-risco-x-retorno",
      },
    ],
    availability: "available",
    videoSrc: "/videos/fixed_income.mp4",
  },
};

export function getLearningClassHref(id: StrategyAssetClassId) {
  return `/aprender?class=${id}#class-content`;
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
