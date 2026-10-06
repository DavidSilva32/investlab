# Importações

## Referência

`design-reference.png` é uma proposta de IA desktop recriada em 06/10/2026 para a rota `/imports`. Ela mostra o estado de prévia de posições da B3 com um arquivo selecionado e substitui a proposta anterior, que usava verde como identidade global. A nova referência segue a identidade azul aprovada e superfícies neutras. Não é uma captura do produto.

## Experiência retratada

A página real usa `src/app/imports/page.tsx`, `AppShell` e `PortfolioImport`. A imagem inclui a navegação real, o título e descrição da rota, seleção de planilhas XLSX, prévia de posições, resumo reconhecido, data de referência, tabela e ações Cancelar/Confirmar. O estado retratado tem três posições com valor e data preenchida, sem divergência de identidade.

Os nomes de arquivo, instituições, produtos, códigos, datas e valores são sintéticos. O total de R$ 12.450,00 apenas reconcilia as três linhas ilustrativas; não representa carteira ou dado observado. Nenhuma classe de ativo é indicada, portanto não se aplica cor semântica de classe.

## Limites funcionais

A proposta é uma composição visual, não um contrato funcional. O fluxo aceita `.xlsx`, com seleção de vários arquivos, prévia e confirmação. Não oferece suporte a `.xls`, indicação de tamanho máximo, arrastar/soltar, remoção individual, tamanho ou horário de upload, edição de instituição ou status genérico por linha. Divergências de identidade são exibidas em um alerta próprio e bloqueiam a confirmação; posições sem valor total produzem um aviso de total parcial. A data das posições é informada pelo usuário, não inferida da Data de Emissão. A prévia de movimentações é um estado separado e não está representada nesta imagem.

## Estados de entrega

| Estado | Situação |
| --- | --- |
| Referência criada | Sim; proposta desktop gerada por IA e salva neste diretório. |
| Contexto funcional revisado | Sim; rota, shell, conteúdo suportado e divergências foram conferidos no código. |
| Layout implementado | Sim; experiência existente em `src/components/portfolio-import.tsx`; a prévia de movimentações tem cabeçalhos visíveis. |
| Verificação estrutural | ESLint, Prettier, typecheck, build e `git diff --check` passaram na implementação; a imagem foi regenerada sem mudança no código. Testes não foram executados. |
| Comparação visual real | Não realizada; nenhuma captura do produto foi feita e não foi usado navegador/Playwright. |
| Aprovação visual do usuário | O usuário solicitou a recriação; aprovação visual específica desta nova proposta ainda não foi registrada. |

Comparações em telas menores não usam imagens; mantenha e valide a responsividade no código.
