# Proposta — Análises da carteira (#243)

> **Histórico:** a aba “Minha carteira” foi aposentada na issue #257. Este protótipo preserva o registro da aprovação anterior, mas não descreve a interface atual nem deve orientar implementação nova.

## Contexto

- **Rota e experiência:** `/analyses`, aba **Minha carteira**.
- **Tarefa principal:** entender rapidamente como a carteira está distribuída e abrir uma análise compatível com a classe escolhida.
- **Problemas observados:** a tela repete a longa lista de posições de `/carteira`, abre grupos com dezenas de notas de renda fixa e esconde o próximo passo das análises de ações.
- **Componentes atuais:** `PortfolioOpportunities`, `PortfolioSummary`, `PortfolioPositions` e os dados de `/api/analyses/portfolio-opportunities` e `/api/portfolio/allocation`.
- **Dados disponíveis:** posição e valor de mercado quando conhecidos; classe específica do catálogo; indicadores e referências por ação brasileira quando sustentados pelos dados necessários; campos manuais de LPA, VPA e proventos no fluxo existente.
- **Navegação real:** abas Minha carteira, Análise individual e Comparar empresas; a página `/carteira` continua sendo a lista completa de posições.
- **Tokens:** identidade azul global; Renda fixa laranja; Ações e BDRs azul; ETFs internacionais roxo; Fundos imobiliários (FIIs) verde.
- **Amostra:** valores e quantidades fictícios identificados como “dados demonstrativos”; nenhuma recomendação ou conclusão financeira é simulada.

## Proposta

- Resumo da carteira e participação por classe ficam no primeiro bloco.
- A lista integral de posições deixa de ser repetida nesta tela; ela continua acessível em **Carteira**.
- Cada classe específica tem um bloco compacto, fechado inicialmente, com total conhecido, quantidade de posições e uma ação coerente com o que o produto realmente oferece.
- Renda fixa apresenta um resumo agregado por classe. A proposta não combina notas por emissor/instituição nem sugere que produtos com vencimentos ou indexadores diferentes sejam o mesmo ativo.
- Ações e BDRs têm linhas compactas por ativo. Quando faltarem dados para Graham ou Bazin, a própria linha oferece **Completar dados** e abre os campos manuais do fluxo existente, em vez de esconder o formulário sob uma seção genérica.
- Um dado ausente não aparece como zero nem como um cartão grande “Indisponível”. A linha informa em termos simples qual dado falta e permite seguir para a entrada manual compatível.
- ETFs internacionais e FIIs mantêm sua participação visível, sem receber fórmulas de ações que não lhes pertencem.
- Protótipo HTML de desktop, tema claro, com controles acessíveis por teclado e regras responsivas de layout. No estado inicial, Ações e BDRs fica aberto para destacar o próximo passo; as demais classes permanecem recolhidas.

## Estados de acompanhamento

- Referência criada: concluída neste HTML.
- Revisão do contexto funcional: parcial; baseada no código, na rota ativa, no catálogo e nas capturas fornecidas.
- Layout implementado: concluído na experiência real `/analyses`, aba Minha carteira, em `src/app/(private)/analyses/_components/portfolio-summary.tsx` e `portfolio-positions.tsx`; validar novamente após a implementação.
- Verificação estrutural: concluída nos testes espelhados dos componentes de resumo, classes, oportunidades e detalhes da oportunidade (50 testes); cobertura focada: 100% em statements, branches, functions e lines. ESLint e Prettier passaram.
- Comparação visual real: pendente; nenhuma captura do navegador foi feita para esta proposta.
- Aprovação do usuário: aprovada explicitamente em 20/10/2026; a aprovação cobre a composição e o fluxo propostos, não uma comparação visual real.

## Limites e decisão necessária

A proposta preserva a metodologia e os contratos atuais. Ela não agrupa notas de renda fixa por instituição ou nome semelhante porque esses campos não provam identidade comum de produto, indexador e vencimento. Antes de implementar este layout, o usuário deve aprovar a composição. A consolidação econômica de notas com uma identidade estável é uma decisão separada e não deve ser inferida do protótipo.
