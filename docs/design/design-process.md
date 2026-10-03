# Processo de design com IA

Este contrato vale para a criação de referências visuais e para mudanças de layout no InvestLab. O código e o [`inventário de rotas ativas`](./active-route-inventory.md) são as fontes de verdade do produto; imagens sugerem composição, não comprovam funcionalidades.

## Antes de gerar uma referência

Registre a rota e a experiência real, a aba/Sheet/estado exibido, os componentes existentes, dados e indicadores disponíveis, ações permitidas, navegação verdadeira, tokens semânticos e componentes compartilhados reutilizáveis. Consulte a tela e os componentes reais, além do inventário.

Não invente páginas, navegação, funcionalidades, indicadores, métricas, metodologia ou ações. Dados sintéticos são permitidos somente para ilustrar campos e resultados que o produto suporta. Se uma proposta depender de funcionalidade nova, registre-a como proposta separada; não a apresente como comportamento existente.

Antes de reutilizar uma imagem, confirme sua origem e status. Preserve referências aprovadas e identifique mockups gerados por IA como propostas. Registre a experiência, rota, estado, origem, suporte funcional, elementos fictícios e tokens em um README junto à imagem.

### Identidade aprovada e enquadramento

- Preserve a identidade visual global aprovada: azul para a interface, superfícies escuras neutras e suporte ao tema claro. Gere imagens futuras usando os tokens e referências vigentes; não proponha nem introduza uma mudança de paleta sem registrá-la como decisão pendente.
- Mantenha as cores semânticas de classe independentes da identidade global: renda fixa laranja, ações brasileiras azul, ETFs internacionais roxo e FIIs verde. Confirme no código que a classe exibida é suportada; não infira classe/cor pelo ticker, produto ou subclasse.
- Uma referência de componente complexo pode mostrar somente o componente em foco, sem reproduzir toda a página ao fundo, quando o contexto ao redor não fizer parte da decisão visual. Identifique no README a rota, o componente, o estado, o tema e o contexto de página omitido. Não acrescente controles de fundo que não existem no produto.

## Implementação e cores

Implemente apenas experiências suportadas e use primeiro componentes e padrões compartilhados. Consulte o [`design system`](./design-system.md), os padrões de página e referências aprovadas aplicáveis.

Use os tokens `asset-class-*` definidos em `src/app/globals.css` e o mapeamento compartilhado em `src/lib/portfolio-asset-class-colors.ts` para classes de ativos: renda fixa em laranja, ações brasileiras em azul, ETFs internacionais em roxo e FIIs em verde. Não replique cores diretamente em componentes. Mantenha cores de classe distintas de tokens de finalidade/destino, estado operacional e séries genéricas de gráfico. Preserve o mesmo significado em temas claro e escuro e não use cor como único indicador.

Use os tokens globais de identidade (incluindo `primary`) para azul de marca, ações primárias, estados ativos e foco. A identidade azul não substitui a cor semântica de uma classe; uma tela só aplica uma cor de classe quando o dado identifica essa classe sem ambiguidade.

## Evidência e qualidade

Registre separadamente estes seis estados junto a cada imagem no README da experiência: referência criada; revisão do contexto funcional; layout implementado; verificação estrutural; comparação visual real; aprovação do usuário. Marque a revisão como parcial ou pendente quando os elementos da imagem não tiverem sido comparados com o produto. Para layout e verificação estrutural, cite o registro que sustenta o status e indique quando não foi revalidado nesta tarefa; não infira esses estados. Registre aprovação somente com evidência explícita do usuário. Implementação concluída, testes automatizados e semelhança estrutural não comprovam fidelidade visual nem aprovação.

Uma comparação visual exige captura real da implementação e da referência aplicável, na mesma experiência, estado e viewport, com diferenças observadas registradas. Cubra desktop e mobile quando forem relevantes. Se browser/captura não estiver disponível, marque a comparação como pendente; nunca infira validação a partir do código ou de testes.

Quando a revisão encontrar funcionalidade ou conteúdo visual sem suporte, registre a divergência e o caminho do artefato como backlog documental. Não redesenhe referências aprovadas nem altere o escopo do produto silenciosamente.

## Cobertura

Use a [matriz de cobertura](./active-route-inventory.md#matriz-de-cobertura-visual) para identificar referências existentes e lacunas por experiência. Uma referência cobre mais de um estado somente quando a composição e a tarefa forem comprovadamente compartilhadas. Experiências fora da navegação ativa, incluindo Screener e Study List, não recebem referências nesta cobertura.
