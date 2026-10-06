# AppShell desktop

## Referência

`app-shell-desktop-proposal.png` é uma proposta desktop de IA para o shell compartilhado, usando `/portfolio` e Carteira ativa. Mostra a navegação lateral, o cabeçalho da página e o contexto da conta. O conteúdo da rota foi omitido para manter o foco no shell. Esta é a referência ativa; não serão mantidas imagens dedicadas ao menu mobile.

## Contexto funcional

Conferido em `src/components/app-shell.tsx`, `src/components/logout-button.tsx` e `src/components/ui/sheet.tsx`. Os seis destinos, o título, a rota ativa, o controle de tema, o contexto da conta e a ação Sair correspondem ao código. A composição proposta não altera os destinos nem os fluxos. O menu mobile existente continua necessário no código responsivo, sem referência mobile separada.

## Tokens e diferenças

Tema escuro, superfícies neutras e identidade azul pelos tokens globais. A referência não apresenta classes de ativos nem conteúdo da página. Ícones, dimensões e espaçamentos são proposta visual; mantenha a estrutura, os rótulos e os contratos existentes.

## Estados de entrega

| Estado                      | Situação                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; proposta desktop de IA no arquivo indicado acima.                                                                        |
| Contexto funcional revisado | Sim; rotas, estado ativo, título, cabeçalho e saída conferidos nos componentes citados.                                       |
| Layout implementado         | Sim; sidebar e cabeçalho desktop alinhados à proposta, com rotas, título e ações preservados.                                 |
| Verificação estrutural      | Sim; seis destinos, estado ativo, logout, tema e Sheet responsivo conferidos em revisão de código; `git diff --check` passou. |
| Comparação visual real      | Não realizada por orientação do usuário; não tentar navegador/Playwright neste fluxo.                                         |
| Aprovação visual do usuário | Direção desktop autorizada; comparação visual não solicitada e não realizada.                                                 |
