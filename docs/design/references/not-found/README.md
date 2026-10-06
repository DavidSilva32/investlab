# Página não encontrada

## Referência

`not-found-page-proposal.png` é uma proposta desktop para o fallback global das rotas inexistentes, implementado em `src/app/not-found.tsx`. A composição inclui a marca InvestLab, controle de tema, cartão 404 e a ação `Voltar ao Dashboard`. Não exibe o caminho solicitado nem usa o AppShell.

## Contexto funcional

O arquivo `not-found.tsx` na raiz de `src/app` atende caminhos sem rota correspondente. O `proxy.ts` continua protegendo esses caminhos: usuários sem sessão são redirecionados para `/login`; usuários autenticados recebem o fallback visual de rota inexistente. A tela usa o `ThemeProvider` e os estilos globais do layout raiz. O único destino de navegação é `/`, pelo botão `Voltar ao Dashboard`. Existe um `loading.tsx` na raiz; respostas transmitidas podem usar status HTTP `200`, enquanto respostas sem streaming podem usar `404`, conforme a convenção documentada localmente pelo Next.js. O status HTTP efetivo para caminhos inexistentes ainda não foi verificado.

## Tokens e responsividade

A página usa superfícies neutras, o token azul de identidade e os tokens semânticos para texto, foco e fundo. A referência é somente desktop; o cartão, cabeçalho e controles devem continuar legíveis e utilizáveis em telas menores por meio das classes responsivas do código. Nenhuma classe de ativo é apresentada.

## Estados de entrega

| Estado                      | Situação                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Referência criada           | Sim; proposta desktop de IA no arquivo indicado acima.                                       |
| Contexto funcional revisado | Sim; fallback raiz, proteção do proxy, tema herdado e destino foram conferidos no código.    |
| Layout implementado         | Sim; fallback responsivo implementado sem revelar o caminho inválido nem incluir o AppShell. |
| Verificação estrutural      | Revisão do componente, formatação, lint e typecheck registrados na entrega da implementação. |
| Comparação visual real      | Não realizada por orientação do usuário; não tentar navegador/Playwright neste fluxo.        |
| Aprovação visual do usuário | Implementação autorizada; aprovação visual após comparação não registrada.                   |
