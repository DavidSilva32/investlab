# Proposta — Minha carteira em Análises (#226)

## Escopo e contexto

- **Rota e componente:** `/analyses`, aba “Minha carteira”, implementada em `src/app/(private)/analyses/_components/portfolio-opportunities.tsx`.
- **Tarefa principal:** entender quais referências Graham/Bazin podem ser calculadas para as ações da carteira e qual dado por ação ainda precisa ser informado.
- **Estado ilustrado:** uma posição expandida com dados por ação insuficientes para calcular as referências; lista compacta com seis linhas de exemplo.
- **Tema e viewport:** desktop, tema claro; o HTML também tem regras responsivas para telas estreitas, sem captura mobile.
- **Amostra:** BBSE3 e posição de 8 ações importada em 16/10/2026 conforme captura enviada pelo usuário. As outras cinco linhas são placeholders de organização, não representam posições reais. A proposta evita exibir preço e fundamentos específicos como atuais, pois as capturas mostram cotação divergente ao longo do dia.
- **Fonte de conteúdo:** código atual de `PortfolioOpportunities`, tipos de resposta de `/api/analyses/portfolio-opportunities`, Issue #226 e capturas fornecidas pelo usuário. O logo abreviado é apenas um marcador do protótipo; não representa o arquivo oficial de marca.
- **Limites:** a tela atual só trata referências de ações brasileiras suportadas pelo serviço. ETFs internacionais e Fundos imobiliários (FIIs) aparecem em nota como classes sem cálculo disponível nesta tela, sem métricas ou metodologias inventadas. Os campos não persistem dados e os botões são ilustrativos; a implementação deve reutilizar o formulário e o fluxo de salvamento existentes.

## Decisões da proposta

- A primeira resposta diz com simplicidade por que as referências não estão calculadas.
- LPA e VPA ficam como dados distintos, cada um salvo separadamente; Graham só os combina quando têm a mesma data-base.
- Dividendos e JCP aparecem por ação e com janela de 12 meses, sem confundir com o total creditado na conta; cada entrada mantém sua própria origem e data.
- A taxa-alvo global do Bazin permanece reconhecível e ajustável; ela não é apresentada como recomendação.
- A lista compacta mostra ticker, posição e estado das referências. Os detalhes de um ativo abrem por vez; os dois métodos aparecem numa linha baixa com ajuda contextual, sem cartões grandes nem estado repetido.
- A taxa de Bazin permanece uma configuração global. A ação “Ajustar” expõe um único campo compartilhado, sem repetir a configuração em cada ativo.
- Graham e Bazin permanecem referências educativas secundárias, com explicações curtas em linguagem simples acessíveis por mouse, teclado e toque. A descrição informa o que o preço de referência significa sem transformar o resultado em recomendação.
- ETFs internacionais e FIIs não recebem resultados no protótipo; ampliar metodologias por classe requer dados e regras próprios.
- Cotação, histórico, fundamentos e proventos permanecem estados distintos. A proposta não promete fallback nem transforma ausência em zero.
- Após os feedbacks de 20/10/2026, retirar a seção longa sobre fontes e limitações e reduzir a explicação ao próximo passo. Origem e data continuam junto de cada valor manual porque o contrato atual exige esses campos para salvá-lo; detalhes técnicos de CVM/BRAPI não se repetem na jornada principal.

## Decisão de produto em aberto

A proposta mantém Graham e Bazin como referências educativas opcionais, fora do resumo principal, para preservar o fluxo atual sem apresentar suas saídas como análise conclusiva. Minha recomendação é mantê-los provisoriamente nessa posição secundária e avaliar com usuários iniciantes se as explicações e a entrada manual são compreensíveis. A implementação deve tratar qualquer número como referência limitada aos dados e à fórmula; cotação e pagamentos futuros não são garantidos.

## Estados da experiência

- Referência criada: sim, HTML verificável em `index.html`; versão compacta com expansão por ativo preparada após o feedback do usuário de 20/10/2026.
- Contexto funcional revisado: sim, com base no código, contrato da API e Issue #226.
- Layout implementado em produção: sim; a aba foi reorganizada com resumo, posições agrupadas por classe e análises Graham/Bazin vinculadas somente a ações brasileiras identificadas.
- Verificação estrutural: concluída; cobertura global de testes em 100% nas quatro métricas, lint, formatação dos arquivos desta tarefa e `git diff --check` passaram. Typecheck/build ainda apontam erros em tipos gerados de outras rotas.
- Comparação visual real: não realizada; não houve captura do browser.
- Aprovação: o usuário autorizou a implementação em 20/10/2026; a comparação visual permanece pendente.

## Aprovação

O layout de produção não deve substituir a tela até aprovação explícita desta proposta. Após aprovação, confirmar o comportamento completo dos campos existentes, estados de carregamento/erro/parcial/vazio, teclado/foco, tema escuro e responsividade.
