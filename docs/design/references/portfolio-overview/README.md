# Carteira — visão geral

## Contexto funcional

- Rota: `/portfolio`, visão geral com dados carregados e tema escuro; a proposta inclui o AppShell em viewport desktop.
- Fonte da experiência: `src/app/portfolio/_components/portfolio-overview.tsx` e componentes compartilhados de taxas e distribuição.
- Conteúdo suportado: valor conhecido da carteira e sua qualidade, posições valorizadas, referência de Selic/CDI com data, distribuição por instituição e categoria disponível, principais posições, pontos de atenção e atalhos para objetivos/detalhes.
- Categorias apresentadas na distribuição são rótulos amplos dos dados da carteira; a imagem não atribui a elas cores das classes específicas sem IDs estáveis.

## Referência

| Estado                        | Registro                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Referência criada             | `portfolio-overview-proposal.png`, mockup gerado por IA para a issue #106.                                                                                                                                                                 |
| Revisão do contexto funcional | Revisado contra a rota e componentes atuais. Valores, nomes de instituições, saldos, taxas e posições da imagem são ilustrativos; não representam dados reais nem recomendação.                                                            |
| Layout implementado           | Refinos responsivos pontuais foram aplicados ao resumo e à lista de posições, mantendo a hierarquia existente; o mockup ainda não comprova equivalência de composição.                                                                     |
| Verificação estrutural        | Nesta entrega passaram `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test` (203 arquivos/1.840 testes), `pnpm.cmd test:coverage` (100% em todas as métricas) e `pnpm.cmd build`. `format:check` falha em quatro arquivos preexistentes. |
| Comparação visual real        | Pendente: Chromium não pôde ser instalado por timeout do CDN; nenhuma captura real foi obtida. Desktop e mobile ainda precisam de comparação.                                                                                              |
| Aprovação do usuário          | Pendente.                                                                                                                                                                                                                                  |

## Direção visual

Usa identidade azul e superfícies neutras escuras; não substitui suporte ao tema claro. Distribuições genéricas usam cores neutras quando a fonte não identifica uma classe específica por ID. A imagem é uma proposta de composição, não uma captura ou especificação de dados.
