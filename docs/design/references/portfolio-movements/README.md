# Carteira — movimentações

## Contexto funcional

- Rota: `/portfolio?view=movements`, tabela preenchida e tema escuro; a proposta mostra somente o conteúdo da página em viewport desktop, sem AppShell.
- A experiência lista movimentações registradas em tabela com Data, Tipo, Produto / código, Instituição, Quantidade, Preço unitário e Valor.
- A ação existente permite excluir movimentações importadas. Esta proposta enquadra apenas o conteúdo da experiência; navegação global e estados responsivos ficam fora do recorte.
- Fonte funcional: `src/app/portfolio/_components/portfolio-details.tsx` e a seleção de aba na rota `/portfolio`.

## Referência

| Estado                        | Registro                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Referência criada             | `portfolio-movements-proposal.png`, mockup gerado por IA para a issue #106.                                                                                                                                                                |
| Revisão do contexto funcional | Revisado contra os cabeçalhos e a ação existentes. Ativos, instituições, datas e valores da imagem são sintéticos e ilustrativos. Não inferir desempenho ou classes de investimento a partir deles.                                        |
| Layout implementado           | O cabeçalho empilha título e ação em telas estreitas e os alinha lado a lado a partir de sm; a composição restante foi mantida. A referência ainda não foi comparada ao produto.                                                           |
| Verificação estrutural        | Nesta entrega passaram `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test` (203 arquivos/1.840 testes), `pnpm.cmd test:coverage` (100% em todas as métricas) e `pnpm.cmd build`. `format:check` falha em quatro arquivos preexistentes. |
| Comparação visual real        | Pendente: Chromium não pôde ser instalado por timeout do CDN; nenhuma captura real foi obtida. Comparar desktop e mobile quando disponível.                                                                                                |
| Aprovação do usuário          | Pendente.                                                                                                                                                                                                                                  |

## Direção visual

Identidade azul com superfícies escuras neutras. Azul e vermelho são usados somente como semântica operacional de compra/venda e exclusão; não representam classes de ativos. A proposta não adiciona filtros, KPIs, análise ou outras ações.
