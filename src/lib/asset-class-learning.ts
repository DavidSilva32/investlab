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
    examples?: {
      title: string;
      description: string;
    }[];
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

export const assetClassLearningCourseVersion = 2;

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
        title: "FIIs podem investir em imóveis e créditos imobiliários",
        content:
          "A estratégia de um FII pode envolver imóveis prontos, créditos ligados ao setor imobiliário, cotas de outros fundos ou projetos de desenvolvimento. No mercado, você pode encontrar grupos como fundos de renda, de títulos, de desenvolvimento e híbridos, além dos fundos de fundos. Confira a política do fundo: ela explica o que ele pode ter na carteira.",
        examples: [
          {
            title: "Imóveis de renda (tijolo)",
            description:
              "Investe em imóveis prontos, como shoppings, galpões ou escritórios, e pode receber receitas previstas nos contratos.",
          },
          {
            title: "Títulos imobiliários (papel)",
            description:
              "O fundo investe em títulos de crédito ligados ao mercado imobiliário. A renda depende das condições e dos pagamentos desses créditos.",
          },
          {
            title: "Fundos de fundos",
            description:
              "O portfólio reúne cotas de outros FIIs. Para entender a exposição, vale olhar também os fundos que estão dentro dele.",
          },
          {
            title: "Desenvolvimento",
            description:
              "Pode participar de projetos de incorporação para locação ou venda futura. O prazo e os riscos dependem do projeto.",
          },
          {
            title: "Híbridos",
            description:
              "Têm política que pode combinar diferentes tipos de ativos imobiliários. Confira os limites definidos para cada fundo.",
          },
        ],
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
          "Vacância física indica espaço desocupado. Vacância financeira estima o efeito dos espaços vagos na receita potencial. Também observe se poucos imóveis, inquilinos ou regiões concentram boa parte da carteira: um número grande de imóveis, sozinho, não conta toda a história.",
        examples: [
          {
            title: "Ocupação",
            description:
              "Se duas de dez salas de mesma área estão vazias, 20% da área está sem locação. Isso não informa, sozinho, quanto de receita deixou de entrar.",
          },
          {
            title: "Concentração",
            description:
              "Dez imóveis podem estar na mesma região ou depender de poucos inquilinos. Veja onde estão e de quem vêm as receitas.",
          },
        ],
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
        title: "Rendimentos, patrimônio e preço pedem contexto",
        content:
          "Distribuições podem ser recorrentes, mas variam. O patrimônio líquido é uma estimativa do valor dos ativos menos as obrigações; dividido pelas cotas, forma o valor patrimonial por cota. Comparar esse valor com o preço de mercado pode ajudar a abrir perguntas, mas diferença para baixo não significa automaticamente que a cota está barata. Veja também a origem das receitas e o histórico de distribuições.",
        examples: [
          {
            title: "Valor patrimonial por cota",
            description:
              "É uma referência baseada nos registros e avaliações do fundo. O preço negociado pode ficar acima ou abaixo dela por vários motivos.",
          },
          {
            title: "Rendimento passado",
            description:
              "Ajuda a contar o que foi distribuído em um período. Não promete o mesmo pagamento nos próximos meses.",
          },
        ],
        question: question(
          "Um FII negocia abaixo do valor patrimonial por cota. O que isso permite concluir?",
          [
            "É um ponto de comparação; ainda é preciso entender a carteira, os ativos e os riscos.",
            "Que a cota está necessariamente barata e deve subir.",
            "Que os rendimentos mensais estão garantidos.",
            "Que o fundo tem patrimônio maior que os demais.",
          ],
          [
            "Isso. A relação ajuda a comparar, mas não substitui entender o que há no fundo e por que o preço difere.",
            "Uma diferença para o valor patrimonial não prevê a valorização futura.",
            "O valor patrimonial não garante distribuições futuras.",
            "Patrimônio total e valor patrimonial por cota são medidas diferentes.",
          ],
        ),
      },
    ],
    assessment: [
      question(
        "Um FII investe principalmente em títulos de crédito ligados a imóveis. Qual descrição combina melhor?",
        [
          "É uma estratégia de papel; confira os créditos, as condições e a carteira.",
          "É necessariamente um fundo de tijolo com imóveis alugados.",
          "É um fundo de ações de construtoras.",
          "É uma aplicação cujo rendimento é fixo e garantido.",
        ],
        [
          "Isso. Fundos de papel investem em créditos ligados ao mercado imobiliário; as condições variam.",
          "Fundos de tijolo investem em imóveis; a descrição apresentada fala de créditos.",
          "A estratégia descrita é de crédito imobiliário, não necessariamente de ações.",
          "A estratégia não elimina riscos nem garante um valor de rendimento.",
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
        "O preço de uma cota está abaixo do valor patrimonial por cota. Qual é um próximo passo útil?",
        [
          "Entender a carteira, a data e as avaliações usadas e os riscos que podem explicar a diferença.",
          "Concluir que o mercado errou e que a cota vai subir.",
          "Assumir que os imóveis estão todos alugados.",
          "Tratar o valor patrimonial como garantia de preço mínimo.",
        ],
        [
          "Isso. A diferença merece contexto; os valores patrimoniais e os preços têm datas e critérios próprios.",
          "A relação não indica com certeza a direção futura do preço.",
          "O valor da cota não mede a ocupação dos imóveis.",
          "O valor patrimonial é uma referência, não um piso garantido.",
        ],
      ),
      question(
        "Um FII anuncia que investe em shoppings e galpões. Que tipo de informação isso descreve?",
        [
          "Exemplos de imóveis do portfólio; a política do fundo mostra os detalhes.",
          "Uma garantia de que todos os imóveis terão inquilinos.",
          "A quantidade exata de rendimento que será distribuída.",
          "Uma regra de que o fundo não pode mudar sua carteira.",
        ],
        [
          "Isso. A carteira e a política explicam quais imóveis e limites fazem parte da estratégia.",
          "Imóveis podem ficar vagos e os contratos podem mudar.",
          "O tipo de imóvel não determina um pagamento fixo aos cotistas.",
          "Mudanças dependem das regras e decisões previstas para o fundo.",
        ],
      ),
      question(
        "Um fundo tem muitos imóveis, mas a maior parte da receita vem de um inquilino. O que isso sugere observar?",
        [
          "A concentração de receitas e as condições dos contratos desse inquilino.",
          "Que o fundo é diversificado só pelo número de imóveis.",
          "Que o inquilino continuará pagando para sempre.",
          "Que o valor patrimonial da cota está garantido.",
        ],
        [
          "Correto. A quantidade de imóveis não mostra, sozinha, de onde vem a receita.",
          "Concentração de receita pode continuar mesmo com vários imóveis.",
          "Contratos e pagamentos podem mudar ao longo do tempo.",
          "Receita de inquilino não garante o valor patrimonial da cota.",
        ],
      ),
      question(
        "Um fundo distribuiu valores parecidos por vários meses. O que é correto concluir?",
        [
          "Esse foi o histórico observado; não é garantia de que os próximos pagamentos serão iguais.",
          "Que o próximo pagamento mensal está garantido nesse valor.",
          "Que a cota não pode perder valor.",
          "Que vacância e contratos deixaram de importar.",
        ],
        [
          "Isso. O histórico informa o passado; receitas e distribuições podem variar.",
          "Pagamentos futuros não são definidos apenas pelo histórico.",
          "O preço da cota pode oscilar mesmo quando houve distribuições.",
          "Ocupação e contratos continuam ajudando a explicar as receitas.",
        ],
      ),
      question(
        "Uma pessoa quer saber se dois FIIs têm exposição parecida a regiões e inquilinos. O que comparar?",
        [
          "A localização dos imóveis e a distribuição dos locatários e das receitas.",
          "Somente o número de cotistas de cada fundo.",
          "Apenas o preço unitário das cotas.",
          "O nome dos fundos, sem olhar as carteiras.",
        ],
        [
          "Correto. A carteira ajuda a enxergar concentração por região e por inquilino.",
          "O número de cotistas não revela onde estão os imóveis ou as receitas.",
          "O preço unitário não mostra a composição dos fundos.",
          "Nomes parecidos ou diferentes não substituem consultar a carteira.",
        ],
      ),
      question(
        "Um FII tem patrimônio total maior que outro. O que esse dado permite concluir sozinho?",
        [
          "Que o fundo é maior em valor total; não que seja automaticamente melhor.",
          "Que as cotas terão mais valorização.",
          "Que haverá menos vacância em todos os imóveis.",
          "Que o rendimento por cota será maior.",
        ],
        [
          "Isso. Patrimônio total mostra escala, mas não resume carteira, riscos ou adequação.",
          "O tamanho do patrimônio não prevê a valorização futura das cotas.",
          "Patrimônio total não mede a ocupação de cada imóvel.",
          "O valor distribuído por cota depende de outros fatores.",
        ],
      ),
    ],
    sources: [
      {
        label: "Portal do Investidor: Fundos imobiliários",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii",
      },
      {
        label: "Portal do Investidor: Ativos em que os FII investem",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/fundos-de-investimentos-imobiliarios-fii/politica-de-investimentos-ativos-em-que-os-fii-investem",
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
          "Uma ação representa uma pequena participação em uma empresa. A quantidade e a classe das ações determinam direitos específicos; algumas dão voto em assembleias. No Brasil, também existem BDRs: certificados negociados aqui que representam valores mobiliários emitidos no exterior. Não são a mesma coisa que comprar diretamente a ação estrangeira.",
        examples: [
          {
            title: "Ação",
            description:
              "É como ter uma pequena parte de um negócio: você participa dos riscos e pode se beneficiar se a empresa e o mercado forem bem.",
          },
          {
            title: "BDR",
            description:
              "É um certificado negociado no Brasil que representa um ativo emitido fora do país. Confira qual ativo e quais condições ele representa.",
          },
          {
            title: "Como pode vir o resultado",
            description:
              "A pessoa pode receber valores distribuídos pela empresa ou ter ganho se vender por mais do que pagou. Nenhum dos dois é garantido.",
          },
        ],
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
          "Receita mostra vendas ou serviços; lucro é o que sobra depois de reconhecer custos e despesas. Antes dos números, pergunte o que a empresa vende e de quem vem a receita. Uma demanda que costuma se repetir pode ajudar a entender o negócio, mas não torna a empresa imune a crises, concorrência, dívida ou mudanças no setor.",
        examples: [
          {
            title: "Uma padaria",
            description:
              "O dinheiro das vendas é receita. Depois de pagar ingredientes, equipe, aluguel e outras despesas, o resultado pode ser lucro ou prejuízo.",
          },
          {
            title: "Demanda recorrente",
            description:
              "Contas de energia, alimentos e serviços básicos ajudam a ilustrar demandas frequentes. Isso não significa que toda empresa desses setores seja boa ou segura.",
          },
        ],
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
      question(
        "Uma companhia vende alimentos e costuma ter clientes recorrentes. O que essa característica permite avaliar?",
        [
          "Como a demanda pode funcionar, sem concluir que a empresa está livre de riscos.",
          "Que a empresa sempre terá lucro, qualquer que seja o cenário.",
          "Que o preço da ação vai subir todos os anos.",
          "Que não é necessário olhar concorrentes ou resultados.",
        ],
        [
          "Isso. Frequência de demanda ajuda a entender o negócio, mas não elimina riscos.",
          "Demanda recorrente não garante lucro nem pagamento aos acionistas.",
          "A característica do setor não prevê o preço futuro da ação.",
          "Concorrência e resultados continuam relevantes.",
        ],
      ),
      question(
        "Uma empresa mostra lucro no relatório. O que isso significa para quem tem ações?",
        [
          "É o resultado do período; não significa que todo o lucro será distribuído.",
          "Que cada acionista receberá o lucro integralmente em dinheiro.",
          "Que a cotação não poderá cair.",
          "Que a empresa não tem despesas ou dívidas.",
        ],
        [
          "Correto. A empresa pode reter parte do resultado, e o preço da ação continua variando.",
          "Distribuições dependem de decisões e regras da companhia.",
          "O preço das ações pode oscilar mesmo quando há lucro.",
          "Ter lucro não significa não ter despesas ou dívidas.",
        ],
      ),
      question(
        "Uma pessoa lê ‘ação preferencial’ e ‘ação ordinária’. O que deve conferir?",
        [
          "Os direitos e as características previstos para cada classe de ação.",
          "Assumir que os nomes garantem prioridade em qualquer situação.",
          "Concluir que as duas classes sempre pagam os mesmos proventos.",
          "Escolher apenas pela letra usada no ticker.",
        ],
        [
          "Isso. As classes podem ter direitos diferentes; confira os detalhes da companhia.",
          "Os direitos dependem das regras aplicáveis e dos documentos da empresa.",
          "Distribuições não são necessariamente iguais ou garantidas.",
          "O ticker, sozinho, não substitui entender os direitos da ação.",
        ],
      ),
      question(
        "Uma pessoa quer investir em uma empresa estrangeira pela bolsa brasileira e encontra um BDR. O que está comprando?",
        [
          "Um certificado negociado no Brasil que representa um valor mobiliário do exterior.",
          "A mesma coisa que abrir conta e comprar diretamente no exterior.",
          "Uma cota de fundo imobiliário brasileiro.",
          "Um depósito com rendimento fixo.",
        ],
        [
          "Correto. O BDR oferece exposição indireta ao ativo que representa, segundo suas regras.",
          "O BDR é um certificado negociado no Brasil; não é a compra direta no mercado estrangeiro.",
          "BDR e FII são produtos diferentes.",
          "BDR é renda variável e não promete remuneração fixa.",
        ],
      ),
      question(
        "O preço de uma ação caiu em um dia. Qual é uma forma equilibrada de continuar estudando a empresa?",
        [
          "Separar a oscilação do dia dos resultados, do negócio e do motivo da mudança.",
          "Concluir que a empresa deixou de ter valor.",
          "Comprar automaticamente porque ficou mais barata.",
          "Ignorar os resultados e observar só o preço.",
        ],
        [
          "Isso. Preço varia; contexto do negócio e dos resultados ajuda a interpretar a mudança.",
          "Uma oscilação diária não resume o valor ou a situação de uma empresa.",
          "Queda de preço, por si só, não define se uma ação é adequada.",
          "Cotação isolada não explica os fundamentos do negócio.",
        ],
      ),
    ],
    sources: [
      {
        label: "Portal do Investidor: Ações",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/acoes",
      },
      {
        label: "Portal do Investidor: BDRs",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/brazilian-depositary-receipts-bdrs",
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
          "ETF é um fundo com cotas negociadas em bolsa. Muitos buscam acompanhar um índice: uma carteira de referência com regras para escolher e combinar ativos. A cota dá exposição indireta à carteira do fundo; ela não transforma o investidor em dono direto de cada ativo.",
        examples: [
          {
            title: "Uma cesta pronta",
            description:
              "Em vez de comprar cada item separadamente, a pessoa compra cotas de um fundo que reúne ativos conforme uma estratégia definida.",
          },
          {
            title: "Índice é uma regra de seleção",
            description:
              "Como uma lista com critérios: ela define quais ativos entram e seus pesos. A carteira pode mudar quando as regras do índice mudam.",
          },
        ],
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
          "Há ETFs de ações, renda fixa, setores e mercados diferentes. O nome ajuda a localizar o tema, mas o índice e a carteira mostram a exposição de verdade. Confira também se poucos ativos ou empresas pesam muito no resultado e quais custos estão descritos.",
        examples: [
          {
            title: "Mercado amplo",
            description:
              "Pode reunir empresas de vários setores, mas algumas podem ter peso maior que outras.",
          },
          {
            title: "Setor ou renda fixa",
            description:
              "Um ETF pode focar em um setor específico ou acompanhar títulos de renda fixa. A palavra ETF, sozinha, não diz qual é o risco.",
          },
        ],
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
      question(
        "Um ETF acompanha um índice de ações. O que o índice ajuda a entender?",
        [
          "As regras e os ativos que servem de referência para a carteira do fundo.",
          "Uma promessa de que todos os ativos terão lucro.",
          "O preço que a cota terá no futuro.",
          "Que o fundo não terá custos.",
        ],
        [
          "Isso. A referência e suas regras ajudam a entender o que o fundo busca acompanhar.",
          "Índices não garantem o resultado de seus ativos.",
          "O índice não determina o preço futuro da cota.",
          "Custos e condições devem ser conferidos nos documentos do fundo.",
        ],
      ),
      question(
        "Uma pessoa quer saber se um ETF distribui exposição a muitas empresas. O que deve olhar?",
        [
          "A carteira e o peso de cada ativo, não apenas a quantidade total.",
          "Somente o nome do índice.",
          "O preço de uma cota em reais.",
          "A garantia de que a carteira não terá perdas.",
        ],
        [
          "Correto. Os pesos mostram se poucos ativos concentram boa parte da carteira.",
          "O nome não mostra todos os pesos atuais da carteira.",
          "Preço unitário não informa concentração.",
          "Distribuir exposição não elimina perdas possíveis.",
        ],
      ),
      question(
        "Dois ETFs têm exposições parecidas, mas taxas e custos diferentes. O que fazer?",
        [
          "Conferir os custos descritos e compará-los junto com carteira e regras.",
          "Ignorar custos porque os fundos acompanham índices.",
          "Escolher automaticamente o fundo mais caro.",
          "Tratar a taxa como garantia de desempenho superior.",
        ],
        [
          "Isso. Custos são uma parte da comparação, junto com exposição e condições.",
          "Seguir um índice não significa que custos deixem de existir.",
          "O preço maior não prova que o fundo seja melhor.",
          "Taxa não garante desempenho superior.",
        ],
      ),
      question(
        "Um ETF internacional caiu em reais enquanto a moeda estrangeira subiu. O que ajuda a explicar o resultado?",
        [
          "Ativos, moeda, período e regras do fundo podem atuar juntos.",
          "A moeda sozinha sempre determina o resultado total.",
          "O índice garante que a cotação em reais suba.",
          "A quantidade de cotas explica toda a variação da cota.",
        ],
        [
          "Correto. A cotação em reais pode refletir fatores diferentes ao mesmo tempo.",
          "A variação dos ativos também pode influenciar o valor do ETF.",
          "Um índice é uma referência, não uma garantia de preço.",
          "A quantidade de cotas afeta o valor investido, não explica sozinha a variação unitária.",
        ],
      ),
      question(
        "Uma pessoa percebe que o ETF segue um setor específico. Que conclusão é adequada?",
        [
          "A exposição é direcionada a esse setor e pode ser mais concentrada que um mercado amplo.",
          "O fundo representa igualmente todos os setores.",
          "O setor não afeta os riscos do fundo.",
          "A especialização garante retorno maior.",
        ],
        [
          "Isso. A estratégia setorial ajuda a entender onde a exposição se concentra.",
          "Um ETF setorial não representa automaticamente todos os setores.",
          "O setor pode influenciar os riscos e oscilações da carteira.",
          "Seguir um setor não garante retorno maior.",
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
          "Na renda fixa, as regras de remuneração são definidas na aplicação: podem ser prefixadas, acompanhar uma taxa ou combinar critérios. CDB, LCI e LCA são exemplos de títulos bancários: você empresta recursos à instituição emissora, que assume o compromisso previsto no título. Cada um tem regras próprias de remuneração, prazo e resgate.",
        examples: [
          {
            title: "CDB",
            description:
              "Certificado de Depósito Bancário: um título pelo qual a instituição financeira capta dinheiro e se compromete a devolvê-lo conforme as condições combinadas.",
          },
          {
            title: "LCI e LCA",
            description:
              "Letras de Crédito Imobiliário e do Agronegócio. São títulos bancários com lastro ligado aos créditos desses setores; não significam que cada aplicação financie um imóvel ou uma fazenda específicos.",
          },
          {
            title: "Tesouro Direto",
            description:
              "São títulos públicos federais: ao investir, você empresta recursos ao governo federal, conforme as regras daquele título.",
          },
          {
            title: "Debênture",
            description:
              "É uma forma de uma empresa captar recursos de investidores. A empresa assume os pagamentos previstos, e o risco de crédito precisa ser considerado.",
          },
          {
            title: "A ‘caixinha’ do aplicativo",
            description:
              "É um nome de recurso para guardar dinheiro, não um tipo único de investimento. O produto por trás pode variar: confira o nome e as condições da aplicação mostrada no app.",
          },
        ],
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
          "Liquidez descreve quando e em que condições o recurso pode ser resgatado. Um título pode vencer em uma data futura e ter ou não resgate antes disso. Confira carência, vencimento e se há possibilidade de venda; o nome popular ou a taxa não revela essas condições.",
        examples: [
          {
            title: "Dinheiro para uma conta próxima",
            description:
              "Se a reserva pode ser necessária em breve, confira se o produto permite resgate a tempo e em quais condições.",
          },
          {
            title: "Dinheiro com data planejada",
            description:
              "Para um objetivo mais distante, compare o vencimento com a data em que você pretende usar o recurso.",
          },
          {
            title: "Três jeitos de calcular a remuneração",
            description:
              "Prefixada: taxa definida na aplicação. Pós-fixada: acompanha uma referência, como o CDI. Híbrida: combina taxa e inflação, como IPCA mais juros.",
          },
        ],
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
        "Uma pessoa encontra uma ‘caixinha’ no aplicativo. O que deve conferir para saber em que está investindo?",
        [
          "O produto que está por trás do recurso, o emissor e as regras de prazo e resgate.",
          "Concluir que toda caixinha é um CDB com as mesmas condições.",
          "Olhar apenas o nome e a cor usados no aplicativo.",
          "Assumir que o dinheiro pode ser retirado a qualquer momento.",
        ],
        [
          "Isso. ‘Caixinha’ é uma apresentação do aplicativo; produto e condições podem mudar conforme a opção e a instituição.",
          "O nome de uma funcionalidade não garante que o investimento por trás seja sempre igual.",
          "Nomes e cores não substituem a identificação do produto e das regras.",
          "O prazo e as condições de retirada dependem do investimento escolhido.",
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
      question(
        "Qual frase descreve melhor um CDB?",
        [
          "Um título em que a instituição financeira capta recursos e promete pagar conforme condições combinadas.",
          "Uma participação societária em um banco.",
          "Uma cota de fundo que garante pagamento mensal.",
          "Um empréstimo feito diretamente a um imóvel específico.",
        ],
        [
          "Isso. No CDB, a instituição que emite é quem assume o compromisso previsto no título.",
          "Uma ação representa participação em uma empresa; CDB é um título de dívida.",
          "CDB não é uma cota de fundo e não garante pagamento mensal.",
          "CDB é emitido por instituição financeira, não ligado diretamente a um imóvel específico.",
        ],
      ),
      question(
        "Qual diferença simples ajuda a distinguir LCI e LCA?",
        [
          "A LCI tem lastro ligado ao crédito imobiliário; a LCA, ao crédito do agronegócio.",
          "A LCI é uma ação e a LCA é um fundo de ações.",
          "A LCI sempre tem resgate imediato e a LCA nunca vence.",
          "A LCA é emitida pelo governo e a LCI por empresas de construção.",
        ],
        [
          "Correto. Os nomes e o lastro remetem a setores diferentes; cada oferta tem regras próprias.",
          "Ambas são títulos bancários, não ações nem fundos de ações.",
          "Prazo e resgate dependem das condições do título.",
          "LCI e LCA são títulos bancários, não títulos públicos federais.",
        ],
      ),
      question(
        "Uma pessoa vê uma taxa prefixada e outra ligada a um índice. O que muda entre elas?",
        [
          "A forma prevista para calcular a remuneração; compare também prazo e resgate.",
          "A taxa prefixada não tem risco e a indexada sempre perde dinheiro.",
          "As duas garantem exatamente o mesmo valor final.",
          "Apenas o nome mostrado no aplicativo.",
        ],
        [
          "Isso. A regra de remuneração é diferente, e as demais condições também importam.",
          "Nenhuma forma de remuneração elimina todos os riscos ou garante resultado real.",
          "O valor final depende das regras e do período da aplicação.",
          "A regra afeta como o valor evolui, não apenas a apresentação.",
        ],
      ),
      question(
        "Qual situação descreve melhor uma debênture?",
        [
          "Uma empresa capta dinheiro de investidores e assume uma dívida com condições definidas.",
          "Uma pessoa compra uma parte da empresa e passa a votar automaticamente.",
          "Um banco guarda dinheiro sem prazo ou remuneração.",
          "Um fundo compra apenas imóveis para aluguel.",
        ],
        [
          "Correto. Quem compra debênture é credor da empresa emissora, não sócio por esse título.",
          "A descrição se refere a uma participação societária, não a uma debênture.",
          "Debêntures têm condições de pagamento definidas na emissão.",
          "Essa descrição se aproxima de uma estratégia de FII, não de debênture.",
        ],
      ),
      question(
        "Uma pessoa separa dinheiro numa caixinha para usar em alguns meses. Qual é a primeira checagem útil?",
        [
          "Identificar o investimento por trás do recurso e confirmar se o prazo de resgate combina com a data de uso.",
          "Supor que toda caixinha permite saque imediato.",
          "Escolher apenas pela maior taxa anunciada.",
          "Tratar o nome ‘caixinha’ como uma categoria única de investimento.",
        ],
        [
          "Isso. O nome da funcionalidade não substitui conferir produto, prazo e liquidez.",
          "A possibilidade de retirada depende das regras do produto escolhido.",
          "Taxa sozinha não mostra se o dinheiro estará disponível quando necessário.",
          "As aplicações por trás de uma caixinha podem variar por instituição e opção.",
        ],
      ),
    ],
    sources: [
      {
        label: "Portal do Investidor: Características dos investimentos",
        href: "https://www.gov.br/investidor/pt-br/investir/antes-de-investir/entenda-as-caracteristicas-dos-investimentos",
      },
      {
        label: "Portal do Investidor: Títulos bancários",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-bancarios/titulos-bancarios",
      },
      {
        label: "Banco Central: O que são CDB e RDB?",
        href: "https://www.bcb.gov.br/meubc/faqs/p/o-que-sao-cdb-e-rdb",
      },
      {
        label: "Portal do Investidor: Títulos públicos",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/titulos-publicos",
      },
      {
        label: "Portal do Investidor: Debêntures",
        href: "https://www.gov.br/investidor/pt-br/investir/tipos-de-investimentos/debentures/",
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
