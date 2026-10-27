# Aprender

## Referências visuais

| Arquivo                                                                                | Rota e estado                                                                      | Origem e escopo                                                                                                 | Estado funcional mostrado                                                                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [learning-page-light-desktop-proposal.png](./learning-page-light-desktop-proposal.png) | `/aprender`, desktop, light mode, quatro classes; FIIs selecionado; vídeo pausado. | Referência histórica da página inicial de Aprender, anterior às aulas e à prova; não representa o layout atual. | A imagem não mostra o fluxo atual de aulas, perguntas, prova ou progresso. O player ali representa o vídeo de FIIs. |

## Contexto funcional revisado

A rota ativa é `/aprender`. As capas reutilizam os quatro arquivos WebP compartilhados em `public/images/asset-classes/`, usados também na Estratégia e descritos em `docs/design/references/strategy/class-imagery/README.md`. Não há cópias específicas da página Aprender. Os nomes e IDs das classes vêm de `src/lib/strategy-allocation.ts`: `fiis` — Fundos imobiliários (FIIs), `brazilian_equities` — Ações e BDRs, `international_etfs` — ETFs internacionais e `fixed_income` — Renda fixa. A issue #237 estrutura quatro aulas com uma pergunta de checagem em cada e uma prova final; a issue #269 moderniza a apresentação, acrescenta roteiros de análise próprios e perguntas de aplicação por classe. O vídeo de cada classe aparece na primeira aula.

Os arquivos MP4 das quatro classes estão disponíveis localmente. O mockup não confirma hospedagem, entrega em produção, acessibilidade do conteúdo audiovisual, nem existência de legendas/transcrição. Não gerar, editar ou revisar conteúdo de vídeo nesta implementação.

As aulas e os quizzes são educativos, sem recomendação de compra ou venda. O progresso das aulas, a nota da prova e a aprovação são persistidos por conta em `/api/learning/progress`; a conclusão exige nota mínima 7,0. Cada classe oferece fontes oficiais do Portal do Investidor/CVM sob demanda. O texto de FIIs distingue a participação no fundo da propriedade direta de imóveis e informa que cotas podem ser negociadas em bolsa ou balcão organizado.

As aulas 2–4 de FIIs usam fotografias ilustrativas de shopping, galpão e imóvel residencial. Na aula 2, a pessoa escolhe um exemplo para atualizar a imagem e acompanhar uma representação animada de como um ativo pode entrar na carteira de um fundo. A cena é didática: não representa a composição de um fundo real, propriedade individual ou retorno. Renda fixa, ações/BDRs e ETFs usam diagramas didáticos específicos por aula. Esses exemplos não são dados de produtos ou ativos reais e não definem a composição de uma classe inteira.

## Caminho progressivo para interações gamificadas

Este roteiro orienta melhorias futuras; não afirma que elas já estejam disponíveis.

1. **Aprender — explorar conceitos:** permitir que a pessoa toque ou selecione elementos didáticos e veja a ilustração responder. A transição deve explicar um conceito curto, sem sugerir retorno ou composição real. A aula 2 de FIIs inicia essa etapa; renda fixa, ações/BDRs e ETFs podem receber cenas próprias.
2. **Landing page — experimentar antes de entrar:** tornar a demonstração manipulável para que o visitante altere entradas de exemplo e veja a interface responder, sempre distinguindo dados fictícios de resultados reais.
3. **Chatbot e navegação — acompanhar a ação:** animar abertura, envio, espera e resposta do chatbot e transições importantes da navegação, respeitando interrupção, erro e preferência por movimento reduzido.
4. **Carteira e fluxos — mostrar mudanças reais:** avaliar importação, revisão, simulações e organização da carteira; cada animação deve corresponder a uma mudança confirmada e reversível, quando possível.
5. **Aprender — registrar conquistas:** celebrar a primeira aprovação somente depois de a prova e o emblema serem salvos. Reentrada, repetição da prova e preferência por movimento reduzido não devem repetir a animação.
6. **Metas e reserva — reconhecer progresso:** só comemorar quando houver uma transição confiável para a meta atingida, com dados suficientes e sem posições ausentes ou valores incompletos. Não disparar a animação ao abrir uma meta já concluída.

O pacote Motion para React é MIT e está restrito ao componente interativo de Aprender nesta etapa. A biblioteca oferece gestos e transições; componentes, tutoriais e ferramentas premium são opcionais e não fazem parte da implementação.

Evitar pontos, rankings, sequências ou recompensas por aportes, patrimônio, risco, retorno ou volume de operações.

As animações usam Motion apenas no componente interativo de Aprender e seguem `prefers-reduced-motion`. Ainda não existe um sistema global de pontuação ou progresso entre áreas.

## Tokens e composição

A referência usa o tema claro solicitado; a implementação conserva os temas claro e escuro suportados globalmente pelo app. As classes usam os tokens oficiais independentes da identidade: renda fixa laranja, ações e BDRs azul, ETFs internacionais roxo, FIIs verde. As cores não são o único identificador. A referência é desktop; não foi gerada imagem mobile.

## Estados de entrega

| Estado                      | Situação                                                                                                                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim: a proposta de 2026 é referência histórica; a composição da issue #269 foi aprovada pelo usuário em 22/10/2026.                                                                                                                                             |
| Contexto funcional revisado | Sim: rota `/aprender`, catálogo oficial, quatro vídeos, quatro aulas por classe, quizzes, prova, progresso salvo, fontes e roteiros introdutórios foram conferidos.                                                                                             |
| Layout implementado         | Sim: seletor responsivo, aula em duas colunas no desktop e empilhada no celular, vídeo preservado na primeira aula, visuais contextuais, checagem rápida e roteiros de análise por classe.                                                                      |
| Verificação estrutural      | 94 testes da área Aprender, TypeScript, ESLint focado, Prettier nos arquivos alterados e `git diff --check` passaram. O build local não concluiu: Turbopack falhou ao criar processo filho e o fallback Webpack recebeu EPERM ao criar tipos dentro de `.next`. |
| Comparação visual real      | Pendente até revisar a implementação no navegador e comparar desktop/mobile com a composição aprovada.                                                                                                                                                          |
| Aprovação do usuário        | Proposta da issue #269 aprovada em 22/10/2026; aprovação do layout implementado permanece pendente.                                                                                                                                                             |

Propostas visuais não são capturas, conteúdo final ou prova de fidelidade. Uma implementação aprovada não elimina a necessidade de comparar a página real no navegador.
