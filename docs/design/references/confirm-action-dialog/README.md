# Confirmação de exclusão de movimentações

## Referência

`delete-movements-open-proposal.png` é uma proposta desktop de IA focada no `ConfirmActionDialog` aberto antes da exclusão de movimentações, acionado pela experiência `/portfolio?view=movements`. O tema é escuro e o conteúdo ao redor da página foi omitido.

## Contexto funcional

Conferido em `src/components/confirm-action-dialog.tsx` e `src/components/delete-imported-data-button.tsx`. O diálogo exibe a consequência da exclusão, permite cancelar e oferece “Confirmar exclusão”. Enquanto a requisição está pendente, a confirmação fica desabilitada. A cópia da imagem corresponde ao texto pretendido para o rótulo Movimentações. Este registro cobre esse chamador; outros usos do diálogo, como excluir objetivos, têm consequências próprias.

## Tokens e diferenças

Tema escuro, superfícies neutras e identidade azul global. A ação de confirmação usa o token semântico destrutivo vermelho. Não aparecem estados pendentes nem sucesso/erro.

## Estados de entrega

| Estado                      | Situação                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; proposta de IA no arquivo indicado acima.                                                                       |
| Contexto funcional revisado | Sim; cópia, ações e estado pendente conferidos nos componentes citados.                                              |
| Layout implementado         | Sim; o botão de confirmação usa a variante destrutiva sem alterar o contrato do componente.                          |
| Verificação estrutural      | Sim; estado pendente, cancelamento e os dois chamadores preservados em revisão de código; `git diff --check` passou. |
| Comparação visual real      | Não realizada por orientação do usuário; não tentar navegador/Playwright neste fluxo.                                |
| Aprovação visual do usuário | Direção desktop autorizada; comparação visual não solicitada e não realizada.                                        |
