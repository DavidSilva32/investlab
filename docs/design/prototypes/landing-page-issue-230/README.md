# Protótipo de landing page — Issue #230

## Escopo e fonte de verdade

- Experiência proposta: landing page pública de `/apresentacao` (a rota `/` também entrega a apresentação quando a pessoa não está autenticada).
- Fonte visual funcional: demonstração pública em `/demonstracao`, principalmente as áreas Posições, Objetivos e Estratégia, implementadas em `src/app/(public)/demonstracao/_components/portfolio-demo.tsx`.
- A prévia de posições usa o mesmo cenário fictício da demonstração: R$ 46.000,00; 40% Renda fixa, 30% ETFs internacionais, 20% Fundos imobiliários (FIIs) e 10% Sem destino. Os dois objetivos e a estratégia também repetem os valores fictícios do componente.
- Os quatro cards educacionais usam imagens locais existentes em `public/images/asset-classes/`; são ilustrações de classes, não capturas de aulas nem telas do produto.
- As cores específicas das classes e os nomes oficiais vêm de `src/lib/strategy-allocation.ts` e dos tokens `--asset-class-*` em `src/app/globals.css`.
- Marca usa a logo existente `public/investlab-logo.png`.

## Como interpretar o protótipo

`index.html` é uma composição independente para revisar a hierarquia, o texto e o caminho até a demonstração. Os painéis são mockups em HTML feitos com conteúdo compatível com o cenário fictício da demonstração; não são screenshots reais da aplicação. A alternância Posições / Objetivos / Estratégia funciona localmente. Nenhum dado real ou serviço externo é consultado.

Não há cadastro público, página de planos, cobrança ou checkout no produto atual. Por isso, a ação principal leva à demonstração pública e “Já tenho acesso” leva ao login existente. Acesso pessoal continua por convite. Planos e preços ficam fora deste escopo.

## Decisões de conteúdo nesta proposta

- A chamada principal é “Explorar a demonstração”; login aparece como caminho secundário para quem já tem acesso.
- Não se promete plano gratuito, cadastro aberto, conexão automática de contas, recomendação de investimento, retorno ou resultado.
- A demonstração é identificada como fictícia e separada de qualquer carteira real.
- Os conteúdos atuais são vídeos por classe dentro da plataforma. Aulas estruturadas e questionários são ideias futuras, não recursos apresentados como existentes.

## Estados do processo de design

| Estado                        | Situação                     | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada             | Concluída                    | Este diretório contém a proposta HTML e este README.                                                                                                                                                                                                                                                                                                                                                                                                |
| Revisão do contexto funcional | Concluída para esta proposta | Valores, nomenclatura e promessas revisados contra o produto; menu fictício removido e valor renomeado para “Carteira de exemplo”.                                                                                                                                                                                                                                                                                                                  |
| Layout implementado           | Concluído                    | Aplicado às rotas públicas que renderizam `LandingPage`. A prévia interativa tem componentes de seção em `_components/`.                                                                                                                                                                                                                                                                                                                            |
| Verificação estrutural        | Concluída com ressalvas      | `pnpm test`: 347 arquivos e 3.614 testes passaram; os contratos atualizados de `/` e `/apresentacao` passaram em execução focada; `pnpm test:coverage`: 100% em statements, branches, funções e linhas; lint e formatação passaram. `pnpm typecheck` e a etapa de tipos da build falham em `.next/types` de rotas não alteradas. A compilação Webpack concluiu; a build padrão Turbopack falhou ao iniciar um processo filho durante `globals.css`. |
| Comparação visual real        | Pendente                     | Nenhuma captura de navegador foi feita; o processo de design do projeto proíbe essa comparação neste fluxo.                                                                                                                                                                                                                                                                                                                                         |
| Aprovação do usuário          | Aprovada                     | O usuário aprovou o protótipo e pediu para começar a construção na mensagem mais recente desta tarefa.                                                                                                                                                                                                                                                                                                                                              |

## Revisão de produto

Esta composição propõe uma página mais longa, com benefícios, áreas da demonstração, vídeos existentes, acesso atual por convite e perguntas frequentes. Ela não define os planos comerciais, o preço, a plataforma de pagamento ou o fluxo futuro de cadastro gratuito. Esses pontos continuam como decisões posteriores de produto.

## Referências de conteúdo

- [Nielsen Norman Group — Homepage Design: 5 Fundamental Principles](https://www.nngroup.com/articles/homepage-design-principles/): clareza da proposta de valor e rótulos específicos para ações.
- [Baymard — Homepage UX Best Practices](https://baymard.com/research-articles/ecommerce-homepage-ux): comunicar a oferta e o escopo sem deixar promoções ou excesso de conteúdo esconderem o valor.
