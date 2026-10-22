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
      question(
        "Você compara dois FIIs para entender onde investem. O que consultar primeiro?",
        [
          "A estratégia, a carteira e as regras de cada fundo.",
          "Escolher o fundo com a cota de menor preço.",
          "Assumir que ambos têm os mesmos imóveis e contratos.",
          "Usar somente a quantidade de cotistas.",
        ],
        [
          "Isso. Estratégia, carteira e regras ajudam a entender como cada fundo opera.",
          "Preço por cota sozinho não compara o patrimônio ou os riscos dos fundos.",
          "Fundos podem ter carteiras e contratos diferentes.",
          "A quantidade de cotistas não explica a estratégia nem a carteira.",
        ],
      ),
      question(
        "Ao comparar dois fundos, um tem mais imóveis, mas ambos têm o mesmo número de cotistas. O que ainda verificar?",
        [
          "A estratégia, a concentração e as regras de cada carteira.",
          "Concluir que a diversificação é igual porque têm cotistas em número parecido.",
          "Comparar apenas o preço atual das cotas.",
          "Assumir que mais imóveis sempre significa menos risco.",
        ],
        [
          "Isso. Número de imóveis não substitui a análise de estratégia e concentração.",
          "Quantidade de cotistas não revela composição ou diversificação da carteira.",
          "Preço sozinho não explica estratégia nem riscos.",
          "A quantidade de imóveis não indica sozinha o risco de cada ativo.",
        ],
      ),
      question(
        "Um informe mostra aumento da vacância. O que conferir em seguida?",
        [
          "Quais imóveis ou áreas foram afetados, os contratos e a concentração da carteira.",
          "Concluir que todos os rendimentos vão parar imediatamente.",
          "Olhar apenas o preço atual da cota.",
          "Assumir que a vacância garante uma oportunidade de compra.",
        ],
        [
          "Isso. O contexto dos espaços, contratos e concentração ajuda a entender o dado.",
          "A vacância pode afetar receitas, mas não determina sozinha o efeito ou o momento.",
          "Preço isolado não explica ocupação nem operação do fundo.",
          "Um indicador não determina preço adequado nem recomendação.",
        ],
      ),
      question(
        "Um contrato importante está perto do vencimento. Que informação do contrato ajuda a avaliar o contexto?",
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
        "Um FII teve DY alto em um período. Qual é o próximo passo?",
        [
          "Ver a origem e recorrência das receitas, os contratos e outros riscos do fundo.",
          "Projetar o mesmo rendimento para os próximos meses.",
          "Concluir que a carteira está sempre ocupada.",
          "Tratar o número como garantia contra queda da cota.",
        ],
        [
          "Correto. O DY passado é um retrato do período; contexto e fontes das receitas importam.",
          "Distribuições futuras não são garantidas pelo histórico.",
          "Ocupação requer dados como vacância e contratos.",
          "O indicador não elimina os riscos de mercado.",
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
        "Uma pessoa compra ações de uma companhia. Que relação ela passa a ter com a empresa?",
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
        "O relatório de uma empresa mostra receita maior e lucro menor. O que investigar?",
        [
          "Comparar períodos equivalentes e entender custos, despesas e contexto do setor.",
          "Concluir que o negócio melhorou porque a receita cresceu.",
          "Tratar a receita como lucro distribuído aos acionistas.",
          "Ignorar custos e despesas na leitura do resultado.",
        ],
        [
          "Correto. Receita e lucro medem aspectos diferentes; custos e despesas ajudam a explicar a diferença.",
          "Receita maior, sozinha, não confirma melhora no resultado final.",
          "Receita não é necessariamente distribuída aos acionistas.",
          "Custos e despesas fazem parte da análise do lucro.",
        ],
      ),
      question(
        "Duas empresas têm P/L diferentes. O que fazer antes de comparar os números?",
        [
          "Conferir setor, períodos, lucro por ação e qualidade/comparabilidade dos dados.",
          "Escolher automaticamente a empresa com o menor P/L.",
          "Concluir que a diferença garante retornos distintos.",
          "Ignorar resultados e analisar somente a cotação.",
        ],
        [
          "Isso. O P/L relaciona preço e lucro por ação, mas a comparação exige contexto e dados compatíveis.",
          "Um múltiplo menor não prova que a ação seja adequada nem barata.",
          "Indicadores não garantem resultados futuros.",
          "A cotação sozinha não explica resultados nem indicadores.",
        ],
      ),
      question(
        "Uma empresa mostra lucro maior neste ano que no anterior. Qual é um próximo passo útil?",
        [
          "Comparar períodos equivalentes e investigar receita, despesas e contexto do setor.",
          "Concluir que o lucro maior garante dividendos maiores.",
          "Ignorar a qualidade dos dados porque o lucro subiu.",
          "Tratar um ano isolado como tendência confirmada.",
        ],
        [
          "Isso. Períodos equivalentes, composição do resultado e setor ajudam a interpretar a mudança.",
          "Lucro não significa distribuição automática aos acionistas.",
          "A qualidade e a origem dos dados seguem importantes.",
          "Um dado isolado não comprova tendência.",
        ],
      ),
      question(
        "Uma estimativa de preço teto ficou abaixo da cotação. O que fazer antes de interpretar esse resultado?",
        [
          "Rever método, dados e premissas e comparar com os demais fundamentos e riscos.",
          "Tratar a diferença como previsão certa de queda.",
          "Considerar o cálculo uma recomendação oficial de venda.",
          "Ignorar a qualidade e a data dos dados usados.",
        ],
        [
          "Isso. A estimativa depende de método, dados e premissas; ela não determina a decisão.",
          "Uma fórmula não prevê com certeza o preço futuro.",
          "O resultado é uma estimativa, não uma recomendação oficial.",
          "Dados desatualizados ou inconsistentes podem distorcer uma estimativa.",
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
        "Dois ETFs têm nomes parecidos. O que consultar para saber se expõem ao mesmo mercado?",
        [
          "Índice de referência, carteira e regras de composição de cada fundo.",
          "O nome comercial, sem consultar outros documentos.",
          "Somente a cotação do dia.",
          "A garantia de que os dois terão o mesmo desempenho.",
        ],
        [
          "Correto. A referência, a carteira e as regras mostram melhor a exposição.",
          "Nomes parecidos não asseguram estratégia ou carteira iguais.",
          "Preço isolado não revela os ativos nem o índice.",
          "Fundos podem divergir e não garantem desempenho igual.",
        ],
      ),
      question(
        "Um ETF internacional acompanha um índice, mas sua cotação em reais mudou. O que verificar?",
        [
          "A variação dos ativos e do câmbio no período, além das regras do fundo.",
          "Concluir que a moeda explica toda a variação, sem olhar a carteira.",
          "Assumir que o índice garante a cotação em reais.",
          "Tratar a mudança como uma renda fixa contratada.",
        ],
        [
          "Isso. Ativos e câmbio podem influenciar; confira o período e a exposição do fundo.",
          "A cotação em reais também pode refletir os ativos e outros fatores.",
          "Índices são referências, não garantias de preço.",
          "ETF é negociado em mercado e seu preço pode variar.",
        ],
      ),
      question(
        "Você acompanha um ETF internacional em reais e o câmbio mudou. O que considerar?",
        [
          "A variação cambial junto com os ativos e o período observado.",
          "Apenas o câmbio, assumindo que os ativos não variaram.",
          "Que o índice garante a cotação em reais.",
          "Que a mudança define uma renda mensal fixa.",
        ],
        [
          "Isso. Câmbio e ativos podem influenciar o valor convertido para reais.",
          "A moeda estrangeira pode se valorizar ou desvalorizar frente ao real.",
          "Índices são referências e não garantem cotação.",
          "Câmbio não define distribuição mensal fixa.",
        ],
      ),
      question(
        "Um ETF reúne muitos ativos, mas boa parte da carteira está concentrada em poucos deles. O que concluir?",
        [
          "Examinar pesos, índice e regras; quantidade de ativos sozinha não mede concentração.",
          "Concluir que a carteira está diversificada só pelo número de ativos.",
          "Assumir que a concentração garante retorno maior.",
          "Desconsiderar a composição porque o ETF acompanha um índice.",
        ],
        [
          "Correto. A composição e os pesos ajudam a avaliar concentração; diversificar não elimina riscos.",
          "O número de ativos sozinho não revela seus pesos ou correlação.",
          "Concentração não garante desempenho maior.",
          "O índice tem regras, mas a carteira precisa ser examinada.",
        ],
      ),
      question(
        "Dois ETFs seguem mercados diferentes. Qual comparação ajuda a entender qual atende ao objetivo estudado?",
        [
          "Relacionar objetivo e horizonte à exposição, carteira, custos e riscos de cada fundo.",
          "Escolher o de maior retorno em um único dia.",
          "Supor que mercados diferentes terão o mesmo comportamento.",
          "Tratar desempenho passado como garantia futura.",
        ],
        [
          "Isso. Objetivo, horizonte, exposição e condições ajudam a comparar sem prever resultados.",
          "O nome não descreve todos os detalhes da estratégia.",
          "Um único dia não representa por si só a exposição e os riscos.",
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
        "Uma pessoa pode precisar do dinheiro antes do vencimento. O que analisar no título?",
        [
          "Carência, prazo e condições de resgate ou venda antes do vencimento.",
          "Apenas a taxa anunciada.",
          "Assumir que todo título permite resgate imediato.",
          "Concluir que o vencimento elimina qualquer risco anterior.",
        ],
        [
          "Correto. A liquidez depende das regras específicas de cada produto.",
          "Taxa não informa sozinha quando o dinheiro ficará disponível.",
          "As regras de resgate variam entre produtos.",
          "O vencimento não elimina riscos ou restrições antes dessa data.",
        ],
      ),
      question(
        "Um produto oferece taxa maior que outro. Como continuar a análise?",
        [
          "Comparar prazo, indexador, liquidez, emissor, custos e riscos aplicáveis.",
          "Escolher a taxa maior sem conferir as condições.",
          "Tratar a taxa como prova de que não há risco de crédito.",
          "Ignorar quando o dinheiro poderá ser usado.",
        ],
        [
          "Isso. A taxa é uma parte da comparação; as demais condições também importam.",
          "Uma taxa maior não define sozinha qual produto atende ao objetivo.",
          "Taxa não elimina a possibilidade de o emissor não pagar.",
          "O prazo precisa ser compatível com o uso previsto do recurso.",
        ],
      ),
      question(
        "Um título permite venda antes do vencimento. O que conferir sobre essa saída?",
        [
          "Se há mercado e quais condições e possíveis efeitos no valor da venda.",
          "A quantidade de usuários do aplicativo.",
          "O dia em que o investimento foi pesquisado.",
          "O nome da corretora, sempre.",
        ],
        [
          "Correto. Possibilidade de venda não garante comprador nem preço de saída específico.",
          "Isso não define a liquidez do investimento.",
          "Pesquisa no aplicativo não altera o contrato.",
          "Liquidez depende do produto, do mercado e das regras aplicáveis.",
        ],
      ),
      question(
        "Um título é emitido por uma empresa. Que informação ajuda a avaliar o risco de crédito?",
        [
          "Quem é o emissor e informações sobre sua capacidade de cumprir pagamentos.",
          "Somente a taxa oferecida pelo título.",
          "A cotação de uma ação sem relação com o emissor.",
          "Supor que toda proteção se aplica sem limites ou condições.",
        ],
        [
          "Isso. O risco está ligado à capacidade de pagamento do emissor; proteções têm regras próprias.",
          "Taxa não mede por si só a capacidade de pagamento.",
          "Uma cotação sem relação não informa o risco do emissor.",
          "Proteções podem ter elegibilidade, limites e condições.",
        ],
      ),
      question(
        "A ficha de um título menciona proteção ao investidor. O que conferir antes de contar com ela?",
        [
          "Se o produto e o emissor são elegíveis e quais limites e condições se aplicam.",
          "Assumir que toda aplicação e qualquer valor estão cobertos.",
          "Tratar a proteção como garantia de retorno acima da inflação.",
          "Ignorar emissor, prazo e condições do título.",
        ],
        [
          "Isso. Proteções têm critérios, limites e condições; confirme os detalhes aplicáveis.",
          "A cobertura não implica que todo produto ou valor esteja protegido.",
          "Proteção não garante retorno real positivo.",
          "As condições do produto continuam relevantes.",
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
