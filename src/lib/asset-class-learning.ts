import {
  strategyAssetClasses,
  type StrategyAssetClassId,
} from "@/lib/strategy-allocation";

export type AssetClassLearningOption = {
  text: string;
  explanation: string;
};

export type AssetClassLearningQuestion = {
  question: string;
  options: AssetClassLearningOption[];
  correctOptionIndex: number;
};

export type AssetClassLearningVisual = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

type AssetClassLearningContentBase = {
  imageSrc: string;
  thumbnailSrc: string;
  description: string;
  courseLessons: {
    title: string;
    content: string;
    question: AssetClassLearningQuestion;
    visuals?: AssetClassLearningVisual[];
  }[];
  assessment: AssetClassLearningQuestion[];
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

export const assetClassLearningCourseVersion = 1;

function question(
  title: string,
  answers: [string, string, string, string],
  explanations: [string, string, string, string],
): AssetClassLearningQuestion {
  return {
    question: title,
    options: answers.map((text, index) => ({
      text,
      explanation: explanations[index],
    })),
    correctOptionIndex: 0,
  };
}

const fiiQuestion = question(
  "O que representa uma cota de FII?",
  [
    "Uma participação no fundo imobiliário.",
    "A propriedade direta de um imóvel específico.",
    "Um rendimento mensal garantido.",
    "Um empréstimo feito ao governo.",
  ],
  [
    "Isso mesmo. A cota representa uma fração de participação no patrimônio do fundo.",
    "A propriedade dos imóveis pertence ao fundo; a cota dá participação no próprio fundo.",
    "Rendimentos podem ser distribuídos, mas não são garantidos nem têm valor fixo.",
    "Essa descrição se aproxima de títulos públicos. FII é um fundo com cotas.",
  ],
);

export const assetClassLearningContent: Record<
  StrategyAssetClassId,
  AssetClassLearningContent
> = {
  fiis: {
    imageSrc: "/images/asset-classes/fiis.webp",
    thumbnailSrc: "/images/asset-classes/fiis.webp",
    description:
      "Entenda como funcionam os FIIs, o que observar nos imóveis e nos rendimentos e como comparar informações.",
    courseLessons: [
      {
        title: "O que é um fundo imobiliário?",
        content:
          "Um FII reúne investidores em um fundo com regras próprias. Ao comprar cotas, você passa a ter uma participação proporcional no fundo e nos resultados dele.",
        question: fiiQuestion,
      },
      {
        title: "Um fundo pode investir em vários tipos de imóvel",
        content:
          "O gestor pode selecionar imóveis e ativos conforme a estratégia descrita nos documentos do fundo. Veja exemplos comuns; cada fundo pode ter características próprias.",
        visuals: [
          {
            title: "Shoppings",
            description:
              "Receitas podem vir de aluguéis e de outras cobranças previstas nos contratos.",
            imageSrc: "/images/learning/fiis/shopping-center.webp",
            imageAlt:
              "Átrio amplo de um shopping center com lojas e claraboia.",
          },
          {
            title: "Galpões logísticos",
            description:
              "Empresas podem alugar espaços para armazenar e distribuir produtos.",
            imageSrc: "/images/learning/fiis/logistics-warehouse.webp",
            imageAlt:
              "Interior de um galpão logístico com prateleiras de armazenagem.",
          },
          {
            title: "Imóveis residenciais",
            description:
              "O portfólio pode incluir residências para locação, conforme a estratégia do fundo.",
            imageSrc: "/images/learning/fiis/residential-building.webp",
            imageAlt:
              "Edifício residencial de médio porte em uma rua arborizada.",
          },
        ],
        question: question(
          "O que ajuda a entender a estratégia de um FII?",
          [
            "Ver os imóveis ou ativos e a forma como o fundo pretende obter receitas.",
            "Concluir que todos os FIIs investem nos mesmos imóveis.",
            "Escolher apenas pelo nome do fundo.",
            "Assumir que todo imóvel ficará sempre alugado.",
          ],
          [
            "Correto. Portfólio, contratos e estratégia ajudam a explicar como o fundo busca gerar receitas.",
            "FIIs podem ter estratégias e carteiras bastante diferentes.",
            "O nome não substitui a leitura do portfólio e dos documentos do fundo.",
            "Imóveis podem ficar vagos; ocupação e contratos podem mudar.",
          ],
        ),
      },
      {
        title: "Vacância mostra espaços sem locação",
        content:
          "Vacância física indica espaço desocupado. Vacância financeira estima o efeito dos espaços vagos na receita potencial. Contratos, localização e concentração também ajudam a contextualizar o número.",
        question: question(
          "O que a vacância física procura mostrar?",
          [
            "A parcela da área que está desocupada.",
            "Quanto a cota vai render no próximo mês.",
            "O preço total de todos os imóveis.",
            "Uma garantia de que o fundo não terá inadimplência.",
          ],
          [
            "Isso mesmo. É uma medida da área vaga nos imóveis do portfólio.",
            "Vacância não prevê o rendimento futuro da cota.",
            "Valor dos imóveis é uma informação diferente da ocupação dos espaços.",
            "Vacância não elimina riscos de crédito ou de inadimplência.",
          ],
        ),
      },
      {
        title: "Rendimentos e preço pedem contexto",
        content:
          "Distribuições podem ser recorrentes, mas os valores variam e não são garantidos. Compare o histórico, a origem das receitas, os contratos e o preço da cota; um indicador isolado não resume a qualidade do fundo.",
        question: question(
          "Como interpretar o dividend yield de um FII?",
          [
            "Como uma relação histórica entre distribuições e preço, que não garante o futuro.",
            "Como promessa de que o mesmo valor será pago todo mês.",
            "Como medida completa da qualidade do fundo.",
            "Como garantia de valorização da cota.",
          ],
          [
            "Correto. É uma referência histórica e precisa ser lida junto com outras informações.",
            "Distribuições podem mudar e não são garantidas.",
            "Nenhum indicador isolado resume carteira, gestão, contratos e riscos.",
            "O indicador não garante valorização futura da cota.",
          ],
        ),
      },
    ],
    assessment: [
      fiiQuestion,
      question(
        "O que diferencia um FII de outro?",
        [
          "A estratégia, a carteira e as regras de cada fundo.",
          "Todos seguem a mesma carteira padrão.",
          "Apenas o preço atual da cota.",
          "Somente o número de investidores.",
        ],
        [
          "Isso. Estratégia, carteira, contratos e regras variam entre fundos.",
          "Cada FII tem política e carteira próprias.",
          "Preço sozinho não explica estratégia nem riscos.",
          "A quantidade de cotistas não resume o que o fundo possui ou como opera.",
        ],
      ),
      question(
        "O que pode causar vacância em um imóvel?",
        [
          "Um espaço ficar sem locatário por um período.",
          "O fundo distribuir rendimentos aos cotistas.",
          "A cota ser negociada na bolsa.",
          "O imóvel ser avaliado por um especialista.",
        ],
        [
          "Certo. Um espaço desocupado reduz a área locada e pode afetar receitas.",
          "Distribuição e ocupação são assuntos diferentes.",
          "Negociação da cota não significa que um imóvel esteja vago.",
          "A avaliação do imóvel não determina se há locatário.",
        ],
      ),
      question(
        "Por que observar os contratos de locação?",
        [
          "Eles ajudam a entender prazos, reajustes e condições das receitas.",
          "Eles garantem que a cota sempre subirá.",
          "Eles tornam desnecessário olhar a carteira.",
          "Eles asseguram rendimento igual todos os meses.",
        ],
        [
          "Isso. Contratos ajudam a contextualizar receitas, vencimentos e riscos de locação.",
          "Contratos não garantem valorização de cotas.",
          "A carteira e a concentração também são importantes.",
          "Receitas e distribuições podem variar mesmo com contratos em vigor.",
        ],
      ),
      question(
        "O que um dividend yield passado pode dizer?",
        [
          "Como foram as distribuições em relação ao preço naquele período.",
          "Qual será o rendimento garantido do próximo ano.",
          "Se o imóvel está sempre ocupado.",
          "Se a cota não tem risco de queda.",
        ],
        [
          "Correto. É um retrato histórico, não uma previsão garantida.",
          "O histórico não assegura distribuições futuras.",
          "Ocupação é analisada por outros dados, como vacância.",
          "O preço de cotas pode subir ou cair.",
        ],
      ),
    ],
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
      "Aprenda o básico sobre ações, resultados das empresas e indicadores usados para estudá-las.",
    courseLessons: [
      {
        title: "O que significa comprar uma ação?",
        content:
          "Uma ação representa uma pequena participação em uma empresa. A quantidade e a classe das ações determinam direitos específicos.",
        question: question(
          "Ao comprar uma ação, o que você passa a ter?",
          [
            "Uma participação na empresa, conforme a classe da ação.",
            "Um valor fixo de volta em uma data combinada.",
            "Dividendos obrigatórios todo mês.",
            "Todas as ações da empresa.",
          ],
          [
            "Correto. A ação representa participação, com direitos definidos pela sua classe.",
            "Ações não prometem devolução de um valor fixo em uma data.",
            "Dividendos não são garantidos nem necessariamente mensais.",
            "Uma ação é apenas uma fração do total de ações da empresa.",
          ],
        ),
      },
      {
        title: "Comece entendendo o negócio e os resultados",
        content:
          "Receita mostra vendas ou serviços; lucro mostra o resultado após despesas. Compare períodos equivalentes e considere o setor antes de interpretar mudanças.",
        question: question(
          "O que o lucro líquido ajuda a entender?",
          [
            "O resultado da empresa depois das despesas reconhecidas no período.",
            "O dinheiro garantido que cada acionista vai receber.",
            "A quantidade de ações negociadas na bolsa.",
            "O preço máximo permitido para a ação.",
          ],
          [
            "Isso. É um resultado contábil do período, não uma promessa de distribuição.",
            "Lucro pode ser retido e não significa pagamento garantido ao acionista.",
            "Volume negociado é uma informação de mercado diferente.",
            "Preço teto depende de metodologia e premissas; não é um limite oficial.",
          ],
        ),
      },
      {
        title: "Indicadores respondem perguntas diferentes",
        content:
          "P/L compara preço e lucro por ação; P/VP compara preço e valor patrimonial por ação; ROE relaciona lucro ao patrimônio. Setor, período e qualidade dos dados importam.",
        question: question(
          "O que o P/L relaciona?",
          [
            "Preço da ação e lucro por ação.",
            "Receita e quantidade de funcionários.",
            "Dividendos e dívida pública.",
            "Preço da ação e inflação futura garantida.",
          ],
          [
            "Correto. P/L relaciona preço e lucro por ação, com limitações de período e comparabilidade.",
            "Essa relação não define o P/L.",
            "Dividendos e dívida pública não compõem diretamente o P/L.",
            "O indicador não prevê inflação nem retorno futuro.",
          ],
        ),
      },
      {
        title: "Preço e valor não são a mesma coisa",
        content:
          "Uma análise pode comparar preço com fundamentos e estimativas, mas depende de dados confiáveis e hipóteses. Métodos como Graham são referências de estudo, não garantias nem ordens de compra.",
        question: question(
          "O que um preço teto baseado em uma fórmula representa?",
          [
            "Uma estimativa que depende de método, dados e premissas.",
            "Um preço oficial garantido pela bolsa.",
            "Uma promessa de que a ação não cairá abaixo dele.",
            "Uma recomendação automática de compra.",
          ],
          [
            "Isso. É uma estimativa metodológica, sensível aos dados e às hipóteses usadas.",
            "A bolsa não define um preço teto fundamentalista.",
            "Estimativas não impedem quedas de preço.",
            "Uma fórmula não substitui a decisão do investidor nem uma análise ampla.",
          ],
        ),
      },
    ],
    assessment: [
      question(
        "O que representa uma ação?",
        [
          "Uma participação na empresa.",
          "Um título público.",
          "Uma renda mensal garantida.",
          "Um empréstimo ao banco.",
        ],
        [
          "Isso. A ação representa uma parte da empresa.",
          "Ações são participações societárias, não títulos públicos.",
          "Ações não garantem renda mensal.",
          "A compra da ação não é um empréstimo ao banco.",
        ],
      ),
      question(
        "Receita e lucro são iguais?",
        [
          "Não. Receita é entrada operacional; lucro considera custos e despesas.",
          "Sim, sempre têm o mesmo valor.",
          "Lucro é o total de vendas antes de custos.",
          "Receita é sempre o dinheiro distribuído aos acionistas.",
        ],
        [
          "Correto. Receita e lucro medem aspectos diferentes do resultado.",
          "Custos e despesas fazem com que possam divergir.",
          "Essa descrição é mais próxima da receita bruta.",
          "Receita não é necessariamente distribuída aos acionistas.",
        ],
      ),
      question(
        "O que P/L relaciona?",
        [
          "Preço e lucro por ação.",
          "Preço e área da fábrica.",
          "Dividendo garantido e inflação.",
          "Receita e número de cotistas.",
        ],
        [
          "Certo. O indicador relaciona preço e lucro por ação.",
          "Área de fábrica não compõe o P/L.",
          "P/L não é garantia de dividendo ou de proteção contra inflação.",
          "Número de cotistas é usado para fundos, não para calcular P/L.",
        ],
      ),
      question(
        "Como comparar indicadores entre empresas?",
        [
          "Considerar setor, período e diferenças contábeis.",
          "Comparar qualquer empresa sem contexto.",
          "Escolher sempre o menor número.",
          "Usar apenas um indicador.",
        ],
        [
          "Isso. Contexto melhora a comparação e evita conclusões apressadas.",
          "Empresas e setores podem ter estruturas diferentes.",
          "Um indicador baixo não prova que a empresa seja adequada.",
          "Uma visão mais ampla combina dados e metodologia.",
        ],
      ),
      question(
        "O que um método de preço teto oferece?",
        [
          "Uma estimativa condicionada às premissas do método.",
          "Um preço futuro certo.",
          "Uma recomendação oficial.",
          "Garantia de lucro.",
        ],
        [
          "Correto. Métodos ajudam a estudar cenários, sem garantir resultados.",
          "Nenhum método prevê com certeza o preço futuro.",
          "Uma estimativa não é recomendação oficial.",
          "Investimentos em ações não têm lucro garantido.",
        ],
      ),
    ],
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
      "Entenda como ETFs internacionais funcionam e quais fatores podem influenciar seus resultados.",
    courseLessons: [
      {
        title: "Como funciona um ETF internacional?",
        content:
          "ETF é um fundo com cotas negociadas em bolsa. Ele pode acompanhar um índice ou uma carteira com exposição a outros mercados.",
        question: question(
          "O que é um ETF?",
          [
            "Um fundo com cotas negociadas em bolsa.",
            "Uma moeda estrangeira garantida.",
            "Uma ação de uma única empresa sempre.",
            "Um depósito com retorno fixo.",
          ],
          [
            "Correto. ETF é um fundo negociado em bolsa.",
            "ETF não é uma moeda nem garante retorno.",
            "Um ETF pode reunir vários ativos e não ser de uma única empresa.",
            "ETF não é depósito bancário com taxa fixa.",
          ],
        ),
      },
      {
        title: "Veja o que existe dentro do fundo",
        content:
          "Índice acompanhado, ativos, custos e regras de composição ajudam a entender a exposição. Fundos diferentes podem seguir estratégias diferentes.",
        question: question(
          "O que consultar para entender a exposição de um ETF?",
          [
            "Índice, carteira e regras do fundo.",
            "Somente o nome comercial.",
            "Apenas o preço de hoje.",
            "A garantia de que o índice subirá.",
          ],
          [
            "Isso. Esses dados ajudam a identificar a estratégia e os ativos envolvidos.",
            "Nome comercial não explica a composição completa.",
            "Um preço isolado não revela a exposição do fundo.",
            "Índices não garantem valorização.",
          ],
        ),
      },
      {
        title: "Mercado externo e câmbio podem influenciar",
        content:
          "O resultado em reais pode refletir a variação dos ativos, dos mercados internacionais e da moeda, além de custos e regras do produto.",
        question: question(
          "O que pode influenciar um ETF internacional medido em reais?",
          [
            "Ativos, mercados externos e câmbio.",
            "Somente a taxa básica brasileira.",
            "Um rendimento fixo garantido.",
            "A quantidade de cotas, sozinha.",
          ],
          [
            "Correto. Esses fatores podem influenciar o valor em reais.",
            "A taxa brasileira não é o único fator relevante.",
            "ETF não garante retorno fixo.",
            "Quantidade afeta o valor total investido, não a variação unitária sozinha.",
          ],
        ),
      },
      {
        title: "Diversificação não elimina riscos",
        content:
          "Um ETF pode reunir vários ativos, mas ainda está sujeito às oscilações e concentrações da estratégia que segue. Leia os documentos e entenda os custos.",
        question: question(
          "Diversificação elimina o risco de perda?",
          [
            "Não. Pode distribuir exposição, mas não elimina oscilações e riscos.",
            "Sim, sempre.",
            "Sim, se o fundo seguir um índice conhecido.",
            "Não, mas garante recuperação rápida.",
          ],
          [
            "Isso. Diversificação pode ajudar a distribuir riscos, sem eliminá-los.",
            "Nenhuma diversificação garante ausência de perdas.",
            "Um índice conhecido também pode cair.",
            "Recuperação e prazo não são garantidos.",
          ],
        ),
      },
    ],
    assessment: [
      question(
        "Onde as cotas de ETFs são negociadas?",
        [
          "Em bolsa de valores.",
          "Somente em uma agência bancária.",
          "Apenas diretamente com o índice.",
          "Não são negociadas.",
        ],
        [
          "Isso. ETFs têm cotas negociadas em bolsa.",
          "A negociação não se limita a agência bancária.",
          "Índices são referências e não vendem cotas diretamente.",
          "As cotas podem ser negociadas em bolsa.",
        ],
      ),
      question(
        "O que um índice representa?",
        [
          "Uma carteira ou regra de referência para acompanhar um mercado.",
          "Uma promessa de rentabilidade.",
          "Uma empresa garantidora do ETF.",
          "Um valor fixo de resgate.",
        ],
        [
          "Correto. Índices seguem regras e servem como referência de mercado.",
          "Índices não prometem retorno.",
          "O índice não garante o fundo.",
          "ETF não tem necessariamente valor fixo de resgate.",
        ],
      ),
      question(
        "Por que câmbio pode afetar o valor em reais?",
        [
          "Porque a moeda estrangeira pode se valorizar ou desvalorizar frente ao real.",
          "Porque o câmbio não muda.",
          "Porque elimina a variação dos ativos.",
          "Porque define uma renda mensal fixa.",
        ],
        [
          "Isso. A taxa de câmbio pode alterar a conversão dos ativos para reais.",
          "Câmbio varia ao longo do tempo.",
          "Câmbio não elimina a variação dos ativos.",
          "Câmbio não define distribuição mensal fixa.",
        ],
      ),
      question(
        "Diversificação garante que não haverá perdas?",
        [
          "Não. Ela não elimina riscos de mercado ou de concentração.",
          "Sim, em todos os ETFs.",
          "Sim, desde que haja mais de cinco ativos.",
          "Não, mas garante valorização no longo prazo.",
        ],
        [
          "Correto. Diversificação não elimina a possibilidade de perda.",
          "ETFs também podem cair.",
          "A quantidade sozinha não define a redução de riscos.",
          "Horizonte longo não garante valorização.",
        ],
      ),
      question(
        "O que revisar antes de comparar ETFs?",
        [
          "Estratégia, carteira, custos e riscos.",
          "Somente o nome do fundo.",
          "Apenas o retorno de um dia.",
          "Uma garantia de desempenho futuro.",
        ],
        [
          "Isso. Esses elementos ajudam a comparar produtos com clareza.",
          "O nome não descreve todos os detalhes.",
          "Um único dia é insuficiente para entender a estratégia.",
          "Desempenho futuro não é garantido.",
        ],
      ),
    ],
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
      "Conheça regras de remuneração, prazos, liquidez e riscos dos produtos de renda fixa.",
    courseLessons: [
      {
        title: "O que é renda fixa?",
        content:
          "As regras de remuneração são definidas na aplicação: podem ser prefixadas, acompanhar uma taxa ou combinar critérios. Isso não significa que o retorno seja sempre igual.",
        question: question(
          "O que caracteriza renda fixa?",
          [
            "Regras de remuneração definidas para o produto.",
            "Retorno sempre igual e garantido.",
            "Ausência de risco.",
            "Resgate livre em qualquer momento.",
          ],
          [
            "Correto. As regras são conhecidas, mas o resultado depende do produto e das condições.",
            "A remuneração pode variar conforme o indexador e o prazo.",
            "Há riscos de crédito, mercado e liquidez.",
            "Liquidez varia de acordo com cada aplicação.",
          ],
        ),
      },
      {
        title: "Prazo e liquidez mudam de produto para produto",
        content:
          "Liquidez descreve quando e em que condições o recurso pode ser resgatado. Confira vencimento, carência, possibilidade de venda e eventuais custos.",
        question: question(
          "O que significa liquidez?",
          [
            "Facilidade e condições para transformar o investimento em dinheiro.",
            "A taxa de retorno garantida.",
            "A segurança absoluta do emissor.",
            "O prazo para a empresa distribuir dividendos.",
          ],
          [
            "Isso. Liquidez trata das condições de resgate ou negociação.",
            "Retorno e liquidez são características distintas.",
            "Liquidez não elimina o risco de crédito.",
            "Dividendos não são próprios de todo investimento de renda fixa.",
          ],
        ),
      },
      {
        title: "Emissor e proteção também importam",
        content:
          "O risco de crédito está ligado à capacidade de pagamento do emissor. Veja quem emite, quais proteções se aplicam e seus limites, sem tratar proteção como garantia universal.",
        question: question(
          "O risco de crédito se refere a quê?",
          [
            "À possibilidade de o emissor não cumprir os pagamentos.",
            "À oscilação diária do índice de ações.",
            "À facilidade de consultar o saldo.",
            "À inflação já conhecida dos próximos anos.",
          ],
          [
            "Correto. Ele envolve a capacidade de pagamento do emissor.",
            "Oscilação de ações é risco de mercado.",
            "Consultar saldo não mede risco de crédito.",
            "Inflação futura é incerta.",
          ],
        ),
      },
      {
        title: "Compare condições, não só a taxa anunciada",
        content:
          "Prazo, indexador, liquidez, emissor, custos e proteções compõem a comparação. Uma taxa maior pode vir acompanhada de condições e riscos diferentes.",
        question: question(
          "O que comparar além da taxa?",
          [
            "Prazo, liquidez, emissor, custos e proteções aplicáveis.",
            "Somente a cor do aplicativo.",
            "A taxa sem considerar quando o dinheiro será usado.",
            "A promessa de que não há risco.",
          ],
          [
            "Isso. O conjunto de condições ajuda a entender o produto.",
            "A cor não informa as condições financeiras.",
            "O prazo e o objetivo do dinheiro também importam.",
            "Todo produto envolve algum tipo de risco ou condição.",
          ],
        ),
      },
    ],
    assessment: [
      question(
        "O que significa renda fixa?",
        [
          "Regras de remuneração definidas, que não garantem retorno sempre igual.",
          "Nenhum risco.",
          "Resgate a qualquer momento.",
          "Taxa igual para todos os produtos.",
        ],
        [
          "Correto. Renda fixa descreve as regras de remuneração.",
          "Renda fixa não significa risco zero.",
          "Liquidez depende das condições de cada produto.",
          "Produtos têm condições diferentes.",
        ],
      ),
      question(
        "O que o vencimento indica?",
        [
          "A data prevista para o fim do prazo do título.",
          "Uma garantia de lucro.",
          "O próximo pagamento mensal.",
          "O fim de qualquer risco.",
        ],
        [
          "Isso. Vencimento informa o fim do prazo contratual.",
          "Vencimento não garante lucro.",
          "Pagamentos dependem das regras do produto.",
          "Riscos podem existir até o vencimento.",
        ],
      ),
      question(
        "O que pode limitar a liquidez?",
        [
          "Carência, prazo e condições de resgate ou venda.",
          "A quantidade de usuários do aplicativo.",
          "O dia em que o investimento foi pesquisado.",
          "O nome da corretora, sempre.",
        ],
        [
          "Correto. Confira as regras de saída do produto.",
          "Isso não define a liquidez do investimento.",
          "Pesquisa no aplicativo não altera o contrato.",
          "Liquidez depende do produto e das regras, não só da corretora.",
        ],
      ),
      question(
        "O que é risco de crédito?",
        [
          "Possibilidade de o emissor não cumprir os pagamentos.",
          "A variação do preço de uma ação.",
          "Um erro de digitação no extrato.",
          "A inflação medida no passado.",
        ],
        [
          "Isso. O risco envolve o cumprimento das obrigações pelo emissor.",
          "Essa é uma forma de risco de mercado.",
          "Erro no extrato não define risco de crédito.",
          "Inflação passada é uma medida econômica.",
        ],
      ),
      question(
        "Como avaliar uma taxa maior?",
        [
          "Junto com prazo, liquidez, emissor e riscos.",
          "Como prova de que o produto é sempre melhor.",
          "Como garantia de retorno acima da inflação.",
          "Sem olhar as regras do produto.",
        ],
        [
          "Correto. Taxa é só uma parte da análise.",
          "Taxa maior não torna automaticamente o produto mais adequado.",
          "Não há garantia de retorno real positivo.",
          "As regras definem prazos, riscos e condições.",
        ],
      ),
    ],
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

export type ShuffledLearningOption = AssetClassLearningOption & {
  sourceIndex: number;
  isCorrect: boolean;
};

export function shuffleLearningOptions(
  options: AssetClassLearningOption[],
  correctOptionIndex: number,
  random: () => number = Math.random,
  previousOrder?: number[],
): ShuffledLearningOption[] {
  const result = options.map((option, sourceIndex) => ({
    ...option,
    sourceIndex,
    isCorrect: sourceIndex === correctOptionIndex,
  }));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  if (previousOrder && result.length > 1) {
    const previousCorrectIndex = previousOrder.findIndex(
      (sourceIndex) => sourceIndex === correctOptionIndex,
    );
    const currentCorrectIndex = result.findIndex((option) => option.isCorrect);
    if (currentCorrectIndex === previousCorrectIndex) {
      const swapIndex = (currentCorrectIndex + 1) % result.length;
      [result[currentCorrectIndex], result[swapIndex]] = [
        result[swapIndex],
        result[currentCorrectIndex],
      ];
    }
  }

  return result;
}

export function calculateLearningAssessmentScore(
  correctAnswers: number,
  totalQuestions: number,
) {
  if (totalQuestions <= 0) return 0;
  return Math.min(
    10,
    Math.round((Math.max(0, correctAnswers) / totalQuestions) * 100) / 10,
  );
}

export function hasAllLearningAnswers(
  answers: readonly (number | null)[],
): boolean {
  return answers.every((answer) => answer !== null);
}

export const learningAssessmentPassScore = 7;

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
