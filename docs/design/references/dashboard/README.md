# Dashboard

## Referência canônica

`dashboard-design-reference.png` é a proposta visual atual, gerada por IA para o Dashboard autenticado (`/`), no tema escuro e no estado principal sem abas. Ela orienta a hierarquia e a composição: patrimônio conhecido, Reserva, planejamento de aporte, patrimônio sem destino, próxima ação, pontos de atenção e fatos registrados. Não é uma captura do produto nem valida dados ou funcionalidades.

## Revisão funcional e diferenças de conteúdo

Os elementos foram conferidos com `src/app/page.tsx`, `src/app/_components/dashboard-client.tsx`, `dashboard-summary.tsx`, `dashboard-wealth-summary.tsx`, `dashboard-unassigned-summary.tsx`, `dashboard-next-action.tsx`, `dashboard-observations.tsx`, `emergency-reserve-summary.tsx` e `contribution-assistant.tsx`.

- O patrimônio e as posições com valor vêm do resumo real da carteira, com data-base preservada e indicação de valores ausentes.
- A Reserva mostra os valores conhecidos selecionados, despesas mensais, meta pessoal configurada e cobertura calculada. A meta é do usuário; limites de cobertura, dados incompletos e explicação do cálculo permanecem explícitos. Nenhum prazo de liquidez é inferido.
- O simulador permanece sem resultado até o usuário informar um valor positivo e solicitar a distribuição. O campo vazio com botão desabilitado evita apresentar a saída sintética da imagem. A simulação não movimenta dinheiro.
- Patrimônio sem destino, próxima ação, pontos de atenção e fatos só mostram conteúdo quando os dados reais suportam esse estado. Erros e retries continuam disponíveis.
- Valores, posições, despesas, meta, percentuais, data e exemplos da imagem são ilustrativos. Os selos “Dados ilustrativos” não são mostrados no produto; nenhum dado da imagem foi copiado para a interface.
- A imagem não representa os estados de erro, carregamento, dados ausentes, metas não configuradas ou Reserva incompleta; esses estados reais continuam tratados pelo código.
- A composição da imagem inclui uma navegação lateral e um cabeçalho de marca diferentes do `AppShell` compartilhado atual. A implementação desta etapa reorganiza o conteúdo do Dashboard e mantém o shell comum; uma eventual migração de navegação/identidade afeta outras rotas e precisa de acompanhamento próprio.

## Tokens

Identidade da interface: azul pelos tokens globais `primary`/`brand`; cartões, bordas e texto usam superfícies neutras. As cores específicas de classe só aparecem quando há classe identificada por ID; a proposta do Dashboard não requer classes. Alertas continuam usando tokens de estado operacional, que não significam classe de ativo.

## Estados de entrega

| Estado                      | Situação                                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; proposta de IA, arquivo canônico acima.                                                                                                                                                                                |
| Contexto funcional revisado | Sim; componentes e estados reais conferidos, diferenças documentadas nesta página.                                                                                                                                          |
| Layout implementado         | Sim; composição atualizada e blocos independentes extraídos em componentes do Dashboard.                                                                                                                                    |
| Verificação estrutural      | Typecheck, Prettier nos arquivos alterados e `git diff --check` passaram em 04/10/2026. A suíte completa registrada anteriormente precede este ajuste; testes não foram executados nesta revisão.                           |
| Comparação visual real      | Pendente: o navegador integrado não estava disponível para captura após este ajuste. A captura enviada pelo usuário mostra o estado anterior; falta conferir desktop e mobile nos mesmos estados e viewports da referência. |
| Aprovação visual do usuário | Não registrada.                                                                                                                                                                                                             |
