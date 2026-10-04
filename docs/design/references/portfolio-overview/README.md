# Carteira — visão geral

## Contexto funcional

- Rota: `/portfolio`, visão geral com dados carregados e tema escuro; a proposta inclui o AppShell em viewport desktop.
- Fonte da experiência: `src/app/portfolio/_components/portfolio-overview.tsx` e componentes compartilhados de taxas e distribuição.
- Conteúdo suportado: valor conhecido da carteira e sua qualidade, posições valorizadas, referência de Selic/CDI com data, distribuição por instituição e categoria disponível, principais posições, pontos de atenção e atalhos para objetivos/detalhes.
- Categorias apresentadas na distribuição são valores amplos do cadastro da carteira. Suas barras usam cores genéricas `chart-category-*` associadas explicitamente ao valor; isso não as reclassifica como as quatro classes específicas do catálogo.

## Referência

| Estado                        | Registro                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Referência criada             | `portfolio-overview-proposal.png`, mockup gerado por IA para a issue #106; barras por categoria usam a paleta genérica de séries.                                                          |
| Revisão do contexto funcional | Revisado contra a rota e componentes atuais. Valores, nomes de instituições, saldos, taxas e posições da imagem são ilustrativos; não representam dados reais nem recomendação.            |
| Layout implementado           | Resumo triplo, indicadores, distribuições, três posições principais e atalhos seguem a composição da referência; ressalvas, dados e fluxos existentes foram preservados.                   |
| Verificação estrutural        | Nesta entrega passaram `pnpm.cmd lint`, `pnpm.cmd format:check`, `pnpm.cmd typecheck`, `pnpm.cmd test:coverage` (203 arquivos/1.840 testes; 100% em todas as métricas) e `pnpm.cmd build`. |
| Comparação visual real        | Pendente: o navegador integrado não disponibilizou instância nesta tarefa; nenhuma captura real foi obtida. Desktop e mobile ainda precisam de comparação.                                 |
| Aprovação do usuário          | Referência aprovada pelo pedido explícito de implementação; revisão visual da tela renderizada segue pendente.                                                                             |

## Direção visual

Usa identidade azul e superfícies neutras escuras; não substitui suporte ao tema claro. As categorias amplas usam cores genéricas estáveis por valor do cadastro: renda fixa laranja genérico, renda variável azul genérico, fundos roxo genérico e classe desconhecida neutra. Não são cores `asset-class-*` e não indicam Ações e BDRs, ETFs internacionais ou FIIs. Esta é a única referência vigente para a visão geral; as imagens anteriores foram removidas. A proposta não é captura do produto nem especificação de dados reais.
