# Dashboard

## Referência atual

`dashboard-proposal-v2.png` é a proposta visual atual do Dashboard autenticado (`/`), fornecida pelo fluxo da issue #180 e registrada nesta pasta em 13/10/2026. A pessoa usuária pediu que a imagem fosse colocada no local correto após autorizar a implementação conforme a proposta. É uma imagem de referência em desktop, com tema escuro, carteira carregada e `AppShell` omitido; não é uma captura do produto.

`dashboard-design-reference.png` é a referência anterior, agora histórica. Ela não representa a composição implementada nem deve ser usada como a referência vigente.

## Conteúdo e suporte funcional

A composição atual reorganiza o Dashboard conforme os dados e ações existentes:

- Patrimônio conhecido, quantidade de posições com valor e contexto de data-base.
- Ações para adicionar posição, importar e conciliar dados, e abrir objetivos.
- Gráfico de rosca dos destinos da carteira, usando os dados reais de objetivos e o componente de gráfico existente. Destinos não representam classes de ativos.
- Resumo da Reserva de emergência, com limitações e estados de dados incompletos preservados.
- Revisão condicional de posições sem valor atual.
- Maior posição e próximo vencimento quando houver dados; participação não mede risco e vencimento não confirma liquidez.

Valores, nomes, datas e percentuais na imagem são ilustrativos e não foram copiados para o produto. Estados de carregamento, erro/retry, vazio, indisponibilidade, Reserva incompleta e dados parciais continuam tratados pela implementação.

## Identidade e contexto

O `AppShell` compartilhado continua fornecendo navegação e cabeçalho. A proposta não altera identidade global, paleta nem conteúdo de outras rotas. Cores dos destinos mantêm seu significado próprio e não indicam classe de ativo.

## Estados de entrega

| Estado                      | Situação                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; `dashboard-proposal-v2.png` foi movida da pasta de protótipos para esta pasta de referências.                                                                   |
| Contexto funcional revisado | Sim; dados, destinos, ações e estados foram conferidos com a experiência da rota `/`.                                                                                |
| Layout implementado         | Sim; composição v2 implementada na issue #180 e autorizada pela pessoa usuária em 13/10/2026.                                                                        |
| Verificação estrutural      | Testes, lint, formato, TypeScript e build passaram; `db:check` não conseguiu validar a conexão local. A migration da issue #180 foi gerada, não aplicada.            |
| Comparação visual real      | Pendente; nenhuma captura do produto foi feita.                                                                                                                      |
| Aprovação                   | A pessoa usuária autorizou a implementação conforme a imagem e pediu o registro no local canônico em 13/10/2026. A fidelidade visual não foi declarada nem inferida. |
